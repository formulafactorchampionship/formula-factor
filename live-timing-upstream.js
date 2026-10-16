// -------------------------------------------------------------
// Assetto Hosting race-control websocket client.
// -------------------------------------------------------------
// The server-manager websocket behind /api/race-control refuses any handshake
// whose Origin header does not match its own host, so a browser can never
// connect to it directly. A server-side handshake sends no Origin at all, so it
// is accepted: that is why both the local dev server and the Cloud Run relay
// keep this connection open and fan the JSON out to browsers over SSE.
//
// Implemented with tls + RFC6455 framing, so it needs no extra dependency.

import tls from 'tls';
import crypto from 'crypto';

export const LIVE_TIMING_UPSTREAM = {
  host: 'fr.assettohosting.com',
  port: 60290,
  path: '/api/race-control'
};

export function createLiveTimingUpstream(options = {}) {
  const host = options.host || LIVE_TIMING_UPSTREAM.host;
  const port = Number(options.port || LIVE_TIMING_UPSTREAM.port);
  const path = options.path || LIVE_TIMING_UPSTREAM.path;

  let socket = null;
  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  let fragment = null;
  let retryTimer = null;
  let retryDelay = 2000;
  let connected = false;
  let stopped = true;
  const listeners = { message: [], status: [] };

  function emit(event, payload) {
    listeners[event].forEach(fn => {
      try { fn(payload); } catch (e) { /* listener errors must not break the relay */ }
    });
  }

  function sendFrame(opcode, payload) {
    if (!socket || !socket.writable) return;
    const mask = crypto.randomBytes(4);
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    header[0] = 0x80 | opcode;
    const masked = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) {
      masked[i] = payload[i] ^ mask[i % 4];
    }
    try { socket.write(Buffer.concat([header, mask, masked])); } catch (e) { /* ignore */ }
  }

  function parseFrames() {
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (masked) {
        if (buffer.length < offset + 4) return;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (buffer.length < offset + length) return;

      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }
      buffer = buffer.subarray(offset + length);

      if (opcode === 0x1 || opcode === 0x2) {
        if (fin) {
          if (opcode === 0x1) emit('message', payload.toString('utf8'));
        } else {
          fragment = payload;
        }
      } else if (opcode === 0x0) {
        if (fragment) {
          fragment = Buffer.concat([fragment, payload]);
          if (fin) {
            emit('message', fragment.toString('utf8'));
            fragment = null;
          }
        }
      } else if (opcode === 0x8) { // close
        try { socket.end(); } catch (e) { /* ignore */ }
        return;
      } else if (opcode === 0x9) { // ping -> pong
        sendFrame(0xA, payload);
      }
    }
  }

  function teardown() {
    if (socket) {
      const stale = socket;
      socket = null;
      try { stale.destroy(); } catch (e) { /* ignore */ }
    }
    buffer = Buffer.alloc(0);
    handshakeDone = false;
    fragment = null;
    if (connected) {
      connected = false;
      emit('status', false);
    }
  }

  function scheduleReconnect() {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryDelay);
    retryDelay = Math.min(Math.round(retryDelay * 1.6), 15000);
  }

  function connect() {
    if (stopped || socket) return;

    const key = crypto.randomBytes(16).toString('base64');
    const request =
      'GET ' + path + ' HTTP/1.1\r\n' +
      'Host: ' + host + ':' + port + '\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Key: ' + key + '\r\n' +
      'Sec-WebSocket-Version: 13\r\n\r\n';

    const current = tls.connect(
      { host: host, port: port, servername: host },
      () => { try { current.write(request); } catch (e) { /* ignore */ } }
    );
    socket = current;
    current.setNoDelay(true);

    current.on('data', (chunk) => {
      if (!handshakeDone) {
        buffer = Buffer.concat([buffer, chunk]);
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const head = buffer.subarray(0, headerEnd).toString('latin1');
        buffer = buffer.subarray(headerEnd + 4);
        if (!/^HTTP\/1\.1 101/.test(head)) {
          teardown();
          scheduleReconnect();
          return;
        }
        handshakeDone = true;
        connected = true;
        retryDelay = 2000;
        emit('status', true);
      } else {
        buffer = Buffer.concat([buffer, chunk]);
      }
      parseFrames();
    });

    current.on('error', () => { /* handled by the close event */ });
    current.on('close', () => {
      if (socket !== current) return;
      teardown();
      scheduleReconnect();
    });
  }

  return {
    on(event, fn) {
      if (listeners[event]) listeners[event].push(fn);
    },
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      teardown();
    },
    isConnected() {
      return connected;
    }
  };
}
