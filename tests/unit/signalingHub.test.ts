// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SignalingHub, type Peer } from '../../server/signaling/hub.ts';
import { parseClientMessage, type ServerMessage } from '../../src/communication/signaling/protocol.ts';

class FakePeer implements Peer {
  inbox: ServerMessage[] = [];
  closed: { code?: number; reason?: string } | null = null;
  send(m: ServerMessage) {
    this.inbox.push(m);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  last() {
    return this.inbox[this.inbox.length - 1];
  }
  of<T extends ServerMessage['t']>(t: T) {
    return this.inbox.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
}

function setup(over: ConstructorParameters<typeof SignalingHub>[0] = {}) {
  let t = 0;
  let codes = 0;
  let tokens = 0;
  const hub = new SignalingHub({
    now: () => t,
    randomCode: () => ['ABCDEF', 'GHJKMN', 'PQRSTU'][codes++ % 3]!,
    randomToken: () => (tokens++).toString(16).padStart(32, '0'),
    getUrls: () => ['https://192.168.1.10:8443'],
    ...over,
  });
  const peer = () => {
    const p = new FakePeer();
    hub.connect(p);
    return p;
  };
  const send = (p: FakePeer, msg: object) => hub.handle(p, JSON.stringify(msg));
  return { hub, peer, send, advance: (ms: number) => (t += ms) };
}

const OFFER = { kind: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' };

describe('SignalingHub', () => {
  it('host creates a room and receives code, token and LAN urls', () => {
    const { peer, send } = setup();
    const host = peer();
    send(host, { t: 'host' });
    const room = host.of('room')[0]!;
    expect(room.code).toBe('ABCDEF');
    expect(room.token).toMatch(/^[0-9a-f]{32}$/);
    expect(room.urls).toEqual(['https://192.168.1.10:8443']);
  });

  it('phone joins with the code; both sides are notified; signals are relayed both ways', () => {
    const { peer, send } = setup();
    const host = peer();
    const phone = peer();
    send(host, { t: 'host' });
    send(phone, { t: 'join', code: 'ABCDEF' });
    expect(phone.of('joined')).toHaveLength(1);
    expect(host.of('peer-joined')).toHaveLength(1);

    send(phone, { t: 'signal', payload: OFFER });
    expect(host.last()).toEqual({ t: 'signal', payload: OFFER });

    const answer = { kind: 'answer', sdp: 'v=0\r\nanswer' };
    send(host, { t: 'signal', payload: answer });
    expect(phone.last()).toEqual({ t: 'signal', payload: answer });

    const cand = { kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } };
    send(phone, { t: 'signal', payload: cand });
    expect(host.last()).toEqual({ t: 'signal', payload: cand });
  });

  it('rejects unknown codes and a second phone', () => {
    const { peer, send } = setup();
    const host = peer();
    send(host, { t: 'host' });
    const stranger = peer();
    send(stranger, { t: 'join', code: 'ZZZZZZ' });
    expect(stranger.last()).toMatchObject({ t: 'error', code: 'bad-code' });
    const p1 = peer();
    const p2 = peer();
    send(p1, { t: 'join', code: 'ABCDEF' });
    send(p2, { t: 'join', code: 'ABCDEF' });
    expect(p2.last()).toMatchObject({ t: 'error', code: 'room-full' });
  });

  it('rate-limits join attempts (code guessing)', () => {
    const { peer, send, advance } = setup({ maxJoinAttemptsPerMinute: 3 });
    const p = peer();
    for (let i = 0; i < 3; i++) send(p, { t: 'join', code: 'ZZZZZZ' });
    send(p, { t: 'join', code: 'ZZZZZZ' });
    expect(p.last()).toMatchObject({ t: 'error', code: 'rate-limited' });
    advance(61_000);
    send(p, { t: 'join', code: 'ZZZZZZ' });
    expect(p.last()).toMatchObject({ t: 'error', code: 'bad-code' });
  });

  it('rejects invalid messages and refuses signals outside a room', () => {
    const { hub, peer, send } = setup();
    const p = peer();
    hub.handle(p, 'not json');
    expect(p.last()).toMatchObject({ t: 'error', code: 'invalid' });
    send(p, { t: 'signal', payload: { kind: 'offer', sdp: 'not sdp' } });
    expect(p.last()).toMatchObject({ t: 'error', code: 'invalid' });
    send(p, { t: 'signal', payload: OFFER });
    expect(p.last()).toMatchObject({ t: 'error', code: 'not-in-room' });
    hub.handle(p, JSON.stringify({ t: 'host', code: 'abc' }));
    expect(p.last()).toMatchObject({ t: 'error', code: 'invalid' });
  });

  it('closes peers that flood messages', () => {
    const { peer, send } = setup({ maxMessagesPer10s: 5 });
    const p = peer();
    for (let i = 0; i < 6; i++) send(p, { t: 'ping' });
    expect(p.closed).not.toBeNull();
  });

  it('phone disconnect notifies the host and the phone can resume with its token', () => {
    const { hub, peer, send } = setup();
    const host = peer();
    const phone = peer();
    send(host, { t: 'host' });
    send(phone, { t: 'join', code: 'ABCDEF' });
    const token = phone.of('joined')[0]!.token;
    hub.disconnect(phone);
    expect(host.last()).toEqual({ t: 'peer-left', reason: 'disconnected' });

    const phone2 = peer();
    send(phone2, { t: 'join', code: 'ABCDEF', token });
    expect(phone2.last()).toMatchObject({ t: 'joined', resumed: true, token });
    expect(host.last()).toEqual({ t: 'peer-joined' });
  });

  it('host can resume its room within the grace period; otherwise it expires', () => {
    const { hub, peer, send, advance } = setup({ hostGraceMs: 30_000 });
    const host = peer();
    const phone = peer();
    send(host, { t: 'host' });
    send(phone, { t: 'join', code: 'ABCDEF' });
    const { token } = host.of('room')[0]!;
    hub.disconnect(host);
    expect(phone.last()).toEqual({ t: 'peer-left', reason: 'disconnected' });

    const host2 = peer();
    send(host2, { t: 'host', code: 'ABCDEF', token });
    expect(host2.of('room')[0]).toMatchObject({ code: 'ABCDEF', resumed: true });
    expect(host2.last()).toEqual({ t: 'peer-joined' });
    // …and the phone is told the host is back, so it renegotiates.
    expect(phone.last()).toEqual({ t: 'peer-joined' });

    hub.disconnect(host2);
    advance(31_000);
    hub.sweep();
    expect(hub.roomCount).toBe(0);
    const host3 = peer();
    send(host3, { t: 'host', code: 'ABCDEF', token });
    expect(host3.last()).toMatchObject({ t: 'error', code: 'expired' });
  });

  it('a wrong host token cannot hijack a room', () => {
    const { peer, send } = setup();
    const host = peer();
    send(host, { t: 'host' });
    const evil = peer();
    send(evil, { t: 'host', code: 'ABCDEF', token: 'f'.repeat(32) });
    expect(evil.last()).toMatchObject({ t: 'error', code: 'expired' });
  });

  it('idle rooms without a phone expire', () => {
    const { hub, peer, send, advance } = setup({ roomTtlMs: 1000 });
    const host = peer();
    send(host, { t: 'host' });
    advance(1500);
    hub.sweep();
    expect(hub.roomCount).toBe(0);
    expect(host.last()).toMatchObject({ t: 'error', code: 'expired' });
  });

  it('host leaving closes the room and tells the phone', () => {
    const { hub, peer, send } = setup();
    const host = peer();
    const phone = peer();
    send(host, { t: 'host' });
    send(phone, { t: 'join', code: 'ABCDEF' });
    send(host, { t: 'leave' });
    expect(phone.last()).toEqual({ t: 'peer-left', reason: 'left' });
    expect(hub.roomCount).toBe(0);
  });
});

describe('parseClientMessage', () => {
  it('enforces size, sdp shape and candidate fields', () => {
    expect(parseClientMessage('x'.repeat(20_000))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'signal', payload: { kind: 'offer', sdp: 'v=0' + 'a'.repeat(13_000) } }))).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({ t: 'signal', payload: { kind: 'candidate', candidate: { candidate: 'c', sdpMid: '0', sdpMLineIndex: 99 } } }),
      ),
    ).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'join', code: 'abcdef' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'join', code: 'ABCDEF' }))).toEqual({ t: 'join', code: 'ABCDEF' });
    expect(parseClientMessage(JSON.stringify({ t: 'nope' }))).toBeNull();
  });
});

describe('public-server limits (per client, not per socket)', () => {
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const nthCode = (n: number) => {
    let s = '';
    for (let i = 0; i < 6; i++) {
      s += ALPHA[n % ALPHA.length];
      n = Math.floor(n / ALPHA.length);
    }
    return s;
  };
  function hubWith(over: ConstructorParameters<typeof SignalingHub>[0] = {}) {
    let t = 0;
    let n = 0;
    const hub = new SignalingHub({ now: () => t, randomCode: () => nthCode(n++), ...over });
    const peer = (client?: string) => {
      const p = new FakePeer();
      hub.connect(p, client);
      return p;
    };
    const send = (p: FakePeer, msg: object) => hub.handle(p, JSON.stringify(msg));
    return { hub, peer, send, advance: (ms: number) => (t += ms) };
  }

  it('limits code guessing across many sockets from one client', () => {
    const { peer, send, advance } = hubWith({ maxJoinAttemptsPerClientPerMinute: 5 });
    const results: string[] = [];
    for (let i = 0; i < 8; i++) {
      const p = peer('203.0.113.7'); // a fresh socket each time
      send(p, { t: 'join', code: 'ZZZZZZ' });
      results.push((p.last() as { code: string }).code);
    }
    expect(results.slice(0, 5)).toEqual(Array(5).fill('bad-code'));
    expect(results.slice(5)).toEqual(Array(3).fill('rate-limited'));
    // Another client is unaffected, and the window slides.
    const other = peer('198.51.100.2');
    send(other, { t: 'join', code: 'ZZZZZZ' });
    expect(other.last()).toMatchObject({ code: 'bad-code' });
    advance(61_000);
    const later = peer('203.0.113.7');
    send(later, { t: 'join', code: 'ZZZZZZ' });
    expect(later.last()).toMatchObject({ code: 'bad-code' });
  });

  it('caps pairing sessions per client and in total', () => {
    const { hub, peer, send } = hubWith({ maxRoomsPerClient: 2, maxRooms: 3 });
    const a = [peer('a'), peer('a'), peer('a')];
    a.forEach((p) => send(p, { t: 'host' }));
    expect(a.map((p) => p.last()!.t)).toEqual(['room', 'room', 'error']);
    const b = [peer('b'), peer('b')];
    b.forEach((p) => send(p, { t: 'host' }));
    expect(b.map((p) => p.last()!.t)).toEqual(['room', 'error']);
    expect(hub.roomCount).toBe(3);
  });

  it('a real phone still pairs while someone else is guessing', () => {
    const { peer, send } = hubWith({ maxJoinAttemptsPerClientPerMinute: 3 });
    const host = peer('home');
    send(host, { t: 'host' });
    const code = (host.last() as { code: string }).code;
    for (let i = 0; i < 10; i++) send(peer('attacker'), { t: 'join', code: 'ZZZZZZ' });
    const phone = peer('home');
    send(phone, { t: 'join', code });
    expect(phone.of('joined')).toHaveLength(1);
  });
});
