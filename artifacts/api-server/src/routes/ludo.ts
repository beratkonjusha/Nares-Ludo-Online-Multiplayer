import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateLudoRoomBody,
  JoinLudoRoomBody,
  JoinLudoRoomQueryParams,
  GetLudoRoomQueryParams,
  UpdateLudoPlayerQueryParams,
  UpdateLudoPlayerBody,
  SetLudoReadyQueryParams,
  SetLudoReadyBody,
  RollLudoDiceQueryParams,
  MoveLudoPieceQueryParams,
  MoveLudoPieceBody,
} from "@workspace/api-zod";

type Color = "red" | "green" | "yellow" | "blue";
type Language = "de" | "en" | "sq";
type Player = {
  id: string;
  name: string;
  color: Color;
  language: Language;
  image: string | null;
  host: boolean;
  ready: boolean;
  tokens: number[];
  finished: number;
  connected: boolean;
  lastSeen: number;
};
type Room = {
  code: string;
  targetCount: number;
  hostId: string;
  players: Player[];
  currentPlayer: string | null;
  diceValue: number | null;
  gamePhase: "lobby" | "rolling" | "moving" | "finished";
  winner: string | null;
  gameStarted: boolean;
  version: number;
  clients: Set<Response>;
};

const rooms = new Map<string, Room>();
const colors: Color[] = ["red", "green", "yellow", "blue"];
const roomCode = () => {
  let code = "";
  do code = String(Math.floor(100000 + Math.random() * 900000));
  while (rooms.has(code));
  return code;
};
const playerId = () => crypto.randomUUID();
const publicPlayer = (p: Player) => {
  const { lastSeen: _lastSeen, ...safe } = p;
  return safe;
};
const publicRoom = (room: Room) => ({
  roomId: room.code,
  hostId: room.hostId,
  targetCount: room.targetCount,
  players: room.players.map(publicPlayer),
  currentPlayer: room.currentPlayer,
  diceValue: room.diceValue,
  gamePhase: room.gamePhase,
  winner: room.winner,
  gameStarted: room.gameStarted,
  version: room.version,
});
const sendRoom = (room: Room) => {
  room.version += 1;
  const payload = `event: room\ndata: ${JSON.stringify(publicRoom(room))}\n\n`;
  for (const client of room.clients) client.write(payload);
};
const getRoom = (req: Request) => rooms.get(String(req.query.code ?? ""));
const findPlayer = (room: Room, req: Request) =>
  room.players.find((p) => p.id === String(req.query.playerId ?? ""));
const error = (res: Response, status: number, message: string) =>
  res.status(status).json({ error: message });

function startIfReady(room: Room) {
  if (
    !room.gameStarted &&
    room.players.length === room.targetCount &&
    room.players.every((p) => p.ready && p.name.trim())
  ) {
    room.gameStarted = true;
    room.gamePhase = "rolling";
    room.currentPlayer = room.players[0].id;
    room.diceValue = null;
  }
}

const router: IRouter = Router();

router.post("/ludo/rooms", (req, res) => {
  const parsed = CreateLudoRoomBody.safeParse(req.body);
  if (!parsed.success) { error(res, 400, "Ungültige Raumdaten."); return; }
  const code = roomCode();
  const id = playerId();
  const input = parsed.data.player;
  const room: Room = {
    code,
    targetCount: parsed.data.targetCount,
    hostId: id,
    players: [{
      id, name: input.name.trim(), color: input.color, language: input.language,
      image: input.image ?? null, host: true, ready: false,
      tokens: [-1, -1, -1, -1], finished: 0, connected: true, lastSeen: Date.now(),
    }],
    currentPlayer: null, diceValue: null, gamePhase: "lobby", winner: null,
    gameStarted: false, version: 0, clients: new Set(),
  };
  rooms.set(code, room);
  res.status(201).json({ playerId: id, state: publicRoom(room) }); return;
});

router.post("/ludo/room/join", (req, res) => {
  const query = JoinLudoRoomQueryParams.safeParse(req.query);
  const parsed = JoinLudoRoomBody.safeParse(req.body);
  if (!query.success || !parsed.success) { error(res, 400, "Ungültige Beitrittsdaten."); return; }
  const room = rooms.get(query.data.code);
  if (!room) { error(res, 404, "Raum nicht gefunden"); return; }
  if (room.players.length >= room.targetCount) { error(res, 409, "Raum ist voll"); return; }
  const input = parsed.data.player;
  if (room.players.some((p) => p.color === input.color)) {
    error(res, 409, "Diese Farbe ist bereits vergeben."); return;
  }
  const id = playerId();
  room.players.push({
    id, name: input.name.trim(), color: input.color, language: input.language,
    image: input.image ?? null, host: false, ready: false,
    tokens: [-1, -1, -1, -1], finished: 0, connected: true, lastSeen: Date.now(),
  });
  sendRoom(room);
  res.json({ playerId: id, state: publicRoom(room) }); return;
});

router.get("/ludo/room", (req, res) => {
  const query = GetLudoRoomQueryParams.safeParse(req.query);
  const room = query.success ? rooms.get(query.data.code) : undefined;
  if (!room) { error(res, 404, "Raum nicht gefunden"); return; }
  const player = findPlayer(room, req);
  if (player) { player.connected = true; player.lastSeen = Date.now(); }
  res.json(publicRoom(room)); return;
});

router.get("/ludo/room/events", (req, res) => {
  const room = getRoom(req);
  if (!room) { error(res, 404, "Raum nicht gefunden"); return; }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  room.clients.add(res);
  const player = findPlayer(room, req);
  if (player) { player.connected = true; player.lastSeen = Date.now(); sendRoom(room); }
  res.write(`event: room\ndata: ${JSON.stringify(publicRoom(room))}\n\n`);
  req.on("close", () => {
    room.clients.delete(res);
    if (player) { player.connected = false; player.lastSeen = Date.now(); }
  });
});

router.patch("/ludo/room/player", (req, res) => {
  const query = UpdateLudoPlayerQueryParams.safeParse(req.query);
  const parsed = UpdateLudoPlayerBody.safeParse(req.body);
  const room = query.success ? rooms.get(query.data.code) : undefined;
  if (!room || !parsed.success || !query.success) { error(res, 400, "Ungültige Spielerdaten."); return; }
  const player = room.players.find((p) => p.id === query.data.playerId);
  if (!player) { error(res, 404, "Spieler nicht gefunden"); return; }
  if (player.ready || room.gameStarted) { error(res, 409, "Spieler ist bereits bereit."); return; }
  if (room.players.some((p) => p.id !== player.id && p.color === parsed.data.color)) {
    error(res, 409, "Diese Farbe ist bereits vergeben."); return;
  }
  Object.assign(player, { ...parsed.data, name: parsed.data.name.trim(), image: parsed.data.image ?? null, ready: false });
  sendRoom(room);
  res.json(publicRoom(room)); return;
});

router.post("/ludo/room/ready", (req, res) => {
  const query = SetLudoReadyQueryParams.safeParse(req.query);
  const parsed = SetLudoReadyBody.safeParse(req.body);
  const room = query.success ? rooms.get(query.data.code) : undefined;
  const player = room && query.success ? room.players.find((p) => p.id === query.data.playerId) : undefined;
  if (!room || !player || !parsed.success) { error(res, 400, "Bereitschaft konnte nicht geändert werden."); return; }
  if (!player.name.trim()) { error(res, 400, "Bitte zuerst einen Namen eingeben."); return; }
  player.ready = parsed.data.ready;
  startIfReady(room);
  sendRoom(room);
  res.json(publicRoom(room)); return;
});

router.post("/ludo/room/roll", (req, res) => {
  const query = RollLudoDiceQueryParams.safeParse(req.query);
  const room = query.success ? rooms.get(query.data.code) : undefined;
  const player = room && query.success ? room.players.find((p) => p.id === query.data.playerId) : undefined;
  if (!room || !player) { error(res, 404, "Raum nicht gefunden"); return; }
  if (!room.gameStarted || room.currentPlayer !== player.id || room.gamePhase !== "rolling" || room.diceValue !== null) {
    error(res, 409, "Würfeln ist jetzt nicht erlaubt."); return;
  }
  const rolledValue = Math.floor(Math.random() * 6) + 1;
  room.diceValue = rolledValue;
  const hasLegalMove = player.tokens.some((token) => {
    if (token < 0) return rolledValue === 6;
    return token + rolledValue <= 57;
  });
  if (!hasLegalMove) {
    const currentIndex = room.players.findIndex((p) => p.id === player.id);
    room.currentPlayer = room.players[(currentIndex + 1) % room.players.length].id;
    room.diceValue = null;
    room.gamePhase = "rolling";
    sendRoom(room);
    res.json(publicRoom(room)); return;
  }
  room.gamePhase = "moving";
  sendRoom(room);
  res.json(publicRoom(room)); return;
});

router.post("/ludo/room/move", (req, res) => {
  const query = MoveLudoPieceQueryParams.safeParse(req.query);
  const parsed = MoveLudoPieceBody.safeParse(req.body);
  const room = query.success ? rooms.get(query.data.code) : undefined;
  const player = room && query.success ? room.players.find((p) => p.id === query.data.playerId) : undefined;
  if (!room || !player || !parsed.success) { error(res, 400, "Ungültiger Zug."); return; }
  if (!room.gameStarted || room.currentPlayer !== player.id || room.gamePhase !== "moving" || room.diceValue === null) {
    error(res, 409, "Dieser Zug ist nicht erlaubt."); return;
  }
  const index = parsed.data.tokenIndex;
  const old = player.tokens[index];
  const next = old < 0 ? (room.diceValue === 6 ? 0 : -1) : old + room.diceValue;
  if (next < 0 || next > 57) { error(res, 409, "Diese Figur kann nicht bewegt werden."); return; }
  player.tokens[index] = next;
  if (next === 57) player.finished += 1;
  const extra = room.diceValue === 6;
  room.diceValue = null;
  if (player.finished === 4) {
    room.winner = player.id;
    room.gamePhase = "finished";
  } else if (extra) {
    room.gamePhase = "rolling";
  } else {
    const currentIndex = room.players.findIndex((p) => p.id === player.id);
    room.currentPlayer = room.players[(currentIndex + 1) % room.players.length].id;
    room.gamePhase = "rolling";
  }
  sendRoom(room);
  res.json(publicRoom(room)); return;
});

export default router;