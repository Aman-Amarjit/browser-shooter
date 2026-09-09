import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express, { Request, Response } from 'express';
import http from 'http';
import { FPSGameRoom } from './networking/colyseus/FPSGameRoom.js';

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server
  })
});

// Register Colyseus Rooms
gameServer.define('fps_room', FPSGameRoom);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: Date.now() });
});

server.listen(port, () => {
  console.log(`[Cyber-Strike Server] Colyseus Game Server listening on http://localhost:${port}`);
});
