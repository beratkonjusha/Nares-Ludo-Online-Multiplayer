import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  Dice5,
  Gamepad2,
  Globe2,
  Link2,
  LoaderCircle,
  LogOut,
  Radio,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import {
  getGetLudoRoomQueryKey,
  useCreateLudoRoom,
  useGetLudoRoom,
  useJoinLudoRoom,
  useMoveLudoPiece,
  useRollLudoDice,
  useSetLudoReady,
  useUpdateLudoPlayer,
  type PlayerInputColor,
  type PlayerInputLanguage,
  type PlayerState,
  type RoomState,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type Color = PlayerInputColor;
type Language = PlayerInputLanguage;
type View = 'home' | 'setup' | 'lobby' | 'game' | 'offline';

const colors: Color[] = ['red', 'green', 'yellow', 'blue'];
const colorClass: Record<Color, string> = { red: 'color-red', green: 'color-green', yellow: 'color-yellow', blue: 'color-blue' };
const colorHex: Record<Color, string> = { red: '#ff647f', green: '#8edb61', yellow: '#f4ce5b', blue: '#6fbbff' };
const colorLabel: Record<Color, string> = { red: 'Coral', green: 'Leaf', yellow: 'Sun', blue: 'Sky' };
const getInitials = (name: string) => name.trim().slice(0, 2).toUpperCase() || 'NL';
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'That did not work. Check the room details and try again.';

type OfflinePlayerConfig = { name: string; color: Color; image: string | null; ai?: boolean };

const makeOfflineState = (configured: OfflinePlayerConfig[]): RoomState => ({
  roomId: 'OFFLINE',
  hostId: 'local',
  targetCount: configured.length,
  players: configured.map((player, index) => ({ id: index === 0 ? 'local' : player.ai ? 'ai' : `local-${index}`, name: player.name, color: player.color, language: 'de', image: player.image, host: index === 0, ready: true, tokens: [-1, -1, -1, -1], finished: 0, connected: true })),
  currentPlayer: 'local',
  diceValue: null,
  gamePhase: 'rolling',
  winner: null,
  gameStarted: true,
  version: 1,
});

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button className="brand-lockup" onClick={onClick} data-testid="button-brand-home" type="button">
      <span className="brand-mark">N</span>
      <span className="brand-word"><span>NARES</span>LUDO</span>
    </button>
  );
}

function Topbar({ onHome }: { onHome: () => void }) {
  return (
    <header className="topbar">
      <Brand onClick={onHome} />
      <div className="topbar-meta"><span className="live-dot" /><span>PLAY TOGETHER · STAY CONNECTED</span><Radio size={15} /></div>
    </header>
  );
}

function HeroBoard() {
  return (
    <div className="hero-board-wrap" aria-hidden="true">
      <div className="hero-board-label"><Sparkles size={12} /> 4 PLAYER ROOM</div>
      <div className="hero-board">
        <div className="hero-board-grid">
          <div className="hero-zone hero-zone-pink"><span className="hero-token pink" /><span className="hero-token pink" /></div>
          <div className="hero-zone hero-zone-center"><span className="hero-token lime" /><span className="hero-token cyan" /></div>
          <div className="hero-zone hero-zone-lime"><span className="hero-token lime" /></div>
          <div className="hero-zone hero-zone-orange"><span className="hero-token cyan" /></div>
          <div className="hero-zone hero-zone-center" />
          <div className="hero-zone hero-zone-cyan"><span className="hero-token cyan" /></div>
          <div className="hero-zone hero-zone-lime" />
          <div className="hero-zone hero-zone-center" />
          <div className="hero-zone hero-zone-pink"><span className="hero-token pink" /></div>
        </div>
        <div className="hero-board-stats"><span><strong>LIVE ROOM</strong> · 02:14</span><span><Users size={12} /> 3/4</span></div>
      </div>
    </div>
  );
}

function Home({ onChoose }: { onChoose: (view: View) => void }) {
  return (
    <main className="landing app-content">
      <section className="landing-hero">
        <div>
          <div className="hero-kicker eyebrow"><span className="live-dot" /> A NARES ORIGINAL · 2025</div>
          <h1 className="hero-title">ROLL <span className="outline">LOUD.</span><br /><span className="pink">STAY</span> CLOSE.</h1>
          <p className="hero-copy">A pocket-sized Ludo table for the people you actually want to beat. No feeds. No noise. Just one room, four colours, and a little friendly chaos.</p>
          <div className="hero-actions">
            <button className="button-primary" onClick={() => onChoose('setup')} data-testid="button-play-online" type="button"><Globe2 size={18} /> Play online</button>
            <button className="button-lime" onClick={() => onChoose('offline')} data-testid="button-play-offline" type="button"><Gamepad2 size={18} /> Offline</button>
            <button className="button-ghost" onClick={() => onChoose('setup')} data-testid="button-join-room" type="button"><Link2 size={17} /> Join with a room code</button>
          </div>
        </div>
        <HeroBoard />
      </section>
      <div className="landing-note">
        <span><strong>Built for kitchen tables, sofa corners, and long-distance rematches.</strong></span>
        <span className="landing-note-mark">/ same board · synced moves · zero shouting required</span>
      </div>
    </main>
  );
}

function PlayerForm({
  name, setName, color, setColor, language, setLanguage, code, setCode, image, setImage, mode,
}: {
  name: string; setName: (v: string) => void; color: Color; setColor: (v: Color) => void; language: Language; setLanguage: (v: Language) => void; code: string; setCode: (v: string) => void; image: string | null; setImage: (v: string | null) => void; mode: 'create' | 'join';
}) {
  return (
    <div className="form-stack">
      {mode === 'join' && <div><label className="field-label" htmlFor="room-code">Room code</label><input id="room-code" className="text-input" inputMode="numeric" maxLength={6} placeholder="Six digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} data-testid="input-room-code" /></div>}
      <div><label className="field-label" htmlFor="player-name">Your name</label><input id="player-name" className="text-input" maxLength={24} placeholder="What should we call you?" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-player-name" /></div>
      <div><span className="field-label">Pick your colour</span><div className="color-grid">{colors.map((item) => <button className={`color-option ${color === item ? 'active' : ''}`} style={{ color: colorHex[item] }} key={item} onClick={() => setColor(item)} data-testid={`button-color-${item}`} type="button"><span className={`color-swatch ${colorClass[item]}`} />{colorLabel[item]}</button>)}</div></div>
      <div><label className="field-label" htmlFor="language">Table language</label><select id="language" className="select-input" value={language} onChange={(e) => setLanguage(e.target.value as Language)} data-testid="select-language"><option value="en">English</option><option value="de">Deutsch</option><option value="sq">Shqip</option></select></div>
      <div><label className="field-label" htmlFor="player-image">Profile image</label><input id="player-image" className="text-input" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setImage(String(reader.result)); reader.readAsDataURL(file); }} data-testid="input-player-image" />{image && <img className="upload-preview" src={image} alt="Profile preview" />}</div>
    </div>
  );
}

function Setup({ onBack, onLobby }: { onBack: () => void; onLobby: (response: { state: RoomState; playerId: string; code: string }) => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('red');
  const [language, setLanguage] = useState<Language>('en');
  const [image, setImage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [targetCount, setTargetCount] = useState(4);
  const [error, setError] = useState('');
  const createRoom = useCreateLudoRoom();
  const joinRoom = useJoinLudoRoom();
  const pending = createRoom.isPending || joinRoom.isPending;
  const player = { name: name.trim(), color, language, image };

  const submit = () => {
    setError('');
    if (!player.name) { setError('Add a name so your friends know who just entered the room.'); return; }
    if (mode === 'create') {
      createRoom.mutate({ data: { targetCount, player } }, { onSuccess: (response) => onLobby({ state: response.state, playerId: response.playerId, code: response.state.roomId }), onError: (e) => setError(getErrorMessage(e)) });
    } else {
      if (code.length !== 6) { setError('Room codes are six digits. Check the invite and try again.'); return; }
      joinRoom.mutate({ data: { player }, params: { code } }, { onSuccess: (response) => onLobby({ state: response.state, playerId: response.playerId, code }), onError: (e) => setError(getErrorMessage(e)) });
    }
  };

  return (
    <main className="screen app-content">
      <div className="screen-head"><div><button className="back-button" onClick={onBack} data-testid="button-back-setup" type="button"><ArrowLeft size={15} /> Back to table</button><p className="eyebrow">ONLINE PLAY / ROOM SETUP</p><h1 className="screen-title">Bring your<br /><span className="text-neon">people.</span></h1><p className="screen-subtitle">Start a room and send the code around, or drop into a room already in motion.</p></div></div>
      {error && <div className="error-banner" data-testid="status-setup-error"><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError('')} data-testid="button-dismiss-error" type="button"><X size={15} /></button></div>}
      <div className="setup-layout">
        <section className="panel setup-card">
          <div className="mode-switch"><button className={mode === 'create' ? 'active' : ''} onClick={() => { setMode('create'); setError(''); }} data-testid="button-mode-create" type="button">Create a room</button><button className={mode === 'join' ? 'active' : ''} onClick={() => { setMode('join'); setError(''); }} data-testid="button-mode-join" type="button">Join a room</button></div>
          <PlayerForm {...{ name, setName, color, setColor, language, setLanguage, code, setCode, image, setImage, mode }} />
          {mode === 'create' && <div><span className="field-label" style={{ marginTop: 18 }}>Players at the table</span><div className="target-grid">{[2, 3, 4].map((count) => <button className={`target-option ${targetCount === count ? 'active' : ''}`} key={count} onClick={() => setTargetCount(count)} data-testid={`button-target-${count}`} type="button">{count} players</button>)}</div></div>}
          <p className="form-footnote">{mode === 'create' ? 'Your room starts when everyone is ready. The board stays in sync for every player.' : 'Ask the host for the six digit code. You can change your colour before readying up.'}</p>
          <button className="button-primary form-submit" onClick={submit} disabled={pending} data-testid="button-submit-room" type="button">{pending ? <><LoaderCircle size={17} className="animate-spin" /> Connecting…</> : mode === 'create' ? <><Sparkles size={17} /> Create room</> : <><Link2 size={17} /> Enter room</>}</button>
        </section>
        <aside className="panel side-panel"><h3>One room.<br /><span className="text-lime">No accounts.</span></h3><div className="side-list"><div className="side-list-item"><span className="side-index">01</span><div><b>Make a room</b><span>Choose the size of your table.</span></div></div><div className="side-list-item"><span className="side-index">02</span><div><b>Share the code</b><span>Friends join from any device.</span></div></div><div className="side-list-item"><span className="side-index">03</span><div><b>Ready up</b><span>We start when the table is full.</span></div></div></div></aside>
      </div>
    </main>
  );
}

function useRoomStream(code: string, playerId: string, onState: (state: RoomState) => void) {
  const [connection, setConnection] = useState<'connected' | 'retrying' | 'idle'>('idle');
  const callbackRef = useRef(onState);
  callbackRef.current = onState;
  useEffect(() => {
    if (!code || !playerId || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    const connect = () => {
      source = new EventSource(`/api/ludo/room/events?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`);
      setConnection('retrying');
      source.onopen = () => setConnection('connected');
      const receive = (event: MessageEvent) => {
        try { callbackRef.current(JSON.parse(event.data) as RoomState); } catch { /* ignore malformed stream events */ }
      };
      source.onmessage = receive;
      source.addEventListener('room', receive);
      source.onerror = () => {
        source?.close();
        setConnection('retrying');
        retryTimer = window.setTimeout(connect, 2500);
      };
    };
    connect();
    return () => { if (retryTimer) window.clearTimeout(retryTimer); source?.close(); };
  }, [code, playerId]);
  return connection;
}

function Lobby({ initialState, playerId, code, onExit, onStarted, onState }: { initialState: RoomState; playerId: string; code: string; onExit: () => void; onStarted: (state: RoomState) => void; onState: (state: RoomState) => void }) {
  const [localState, setLocalState] = useState(initialState);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const params = useMemo(() => ({ code, playerId }), [code, playerId]);
  const roomQuery = useGetLudoRoom(params, { query: { queryKey: getGetLudoRoomQueryKey(params), refetchInterval: 4000 } });
  const updatePlayer = useUpdateLudoPlayer();
  const setReady = useSetLudoReady();
  const stream = useRoomStream(code, playerId, (next) => { setLocalState(next); onState(next); });
  const onStateRef = useRef(onState);
  const onStartedRef = useRef(onStarted);
  onStateRef.current = onState;
  onStartedRef.current = onStarted;
  const room = roomQuery.data ?? localState;
  const me = room.players.find((player) => player.id === playerId);
  const patch = (next: RoomState) => { setLocalState(next); onState(next); queryClient.setQueryData(getGetLudoRoomQueryKey(params), next); };
  useEffect(() => { if (roomQuery.data) { setLocalState(roomQuery.data); onStateRef.current(roomQuery.data); } }, [roomQuery.data]);
  useEffect(() => { if (room.gameStarted || room.gamePhase !== 'lobby') onStartedRef.current(room); }, [room.gameStarted, room.gamePhase]);
  const update = () => {
    if (!me) return;
    updatePlayer.mutate({ data: { name: me.name, color: me.color, language: me.language, image: me.image ?? null }, params }, { onSuccess: patch, onError: (e) => setError(getErrorMessage(e)) });
  };
  const toggleReady = () => setReady.mutate({ data: { ready: !me?.ready }, params }, { onSuccess: patch, onError: (e) => setError(getErrorMessage(e)) });
  const copyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else throw new Error('clipboard unavailable');
    } catch {
      const area = document.createElement('textarea');
      area.value = code; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };
  const shareCode = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Nares Ludo', text: `Join my Nares Ludo room: ${code}` }); } catch { /* cancelled share */ }
    } else {
      await copyCode();
    }
  };
  const [editName, setEditName] = useState(me?.name ?? '');
  const [editColor, setEditColor] = useState<Color>(me?.color ?? 'red');
  const [editLanguage, setEditLanguage] = useState<Language>(me?.language ?? 'en');
  const [editImage, setEditImage] = useState<string | null>(me?.image ?? null);
  useEffect(() => {
    if (!me) return;
    setEditName(me.name); setEditColor(me.color); setEditLanguage(me.language); setEditImage(me.image ?? null);
  }, [me?.id, me?.name, me?.color, me?.language, me?.image]);
  if (roomQuery.isLoading && !localState) return <main className="screen app-content"><div className="loading-skeleton" data-testid="loading-lobby" /></main>;
  return (
    <main className="screen app-content">
      <div className="screen-head"><div><button className="back-button" onClick={onExit} data-testid="button-exit-lobby" type="button"><ArrowLeft size={15} /> Leave room</button><p className="eyebrow">ONLINE ROOM / WAITING TABLE</p><h1 className="screen-title">Gather<br /><span className="text-neon">the crew.</span></h1><p className="screen-subtitle">Send the code. Pick your colour. Ready when the room feels right.</p></div></div>
      {error && <div className="error-banner" data-testid="status-lobby-error"><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError('')} data-testid="button-dismiss-lobby-error" type="button"><X size={15} /></button></div>}
      <div className="lobby-shell">
        <section className="panel lobby-main">
          <div className={`connection-strip ${stream === 'connected' ? 'connected' : 'retrying'}`} data-testid="status-realtime"><span className="live-dot" />{stream === 'connected' ? 'Live sync connected' : 'Reconnecting to the live table'}<RefreshCcw size={13} /></div>
           <div className="room-code-box"><div><small>Room code</small><strong data-testid="text-room-code">{code}</strong></div><div className="room-code-actions"><button className="icon-button" onClick={copyCode} title="Copy room code" aria-label="Copy room code" data-testid="button-copy-room-code" type="button">{copied ? <Check size={18} /> : <Copy size={18} />}</button><button className="icon-button" onClick={shareCode} title="Share room code" aria-label="Share room code" data-testid="button-share-room-code" type="button"><Link2 size={18} /></button></div></div>
          <div className="player-list" data-testid="list-players">{room.players.map((player) => <PlayerRow player={player} key={player.id} />)}{Array.from({ length: Math.max(0, room.targetCount - room.players.length) }).map((_, index) => <div className="player-row" key={`empty-${index}`}><div className="player-avatar" style={{ background: 'hsl(240 17% 19%)', color: 'hsl(235 13% 63%)' }}>?</div><div className="player-info"><strong>Open seat</strong><span>Share the code to invite</span></div><span className="status-pill">Waiting</span></div>)}</div>
           {me && !me.ready && <div className="identity-editor panel"><p className="card-title">Your identity</p><div className="identity-fields"><input className="text-input" value={editName} maxLength={24} aria-label="Your name" onChange={(e) => setEditName(e.target.value)} /><select className="select-input" value={editLanguage} aria-label="Your language" onChange={(e) => setEditLanguage(e.target.value as Language)}><option value="de">Deutsch</option><option value="en">English</option><option value="sq">Shqip</option></select></div><div className="color-grid compact-colors">{colors.map((item) => { const taken = room.players.some((p) => p.id !== playerId && p.color === item); return <button className={`color-option ${editColor === item ? 'active' : ''}`} disabled={taken} style={{ color: colorHex[item] }} key={item} onClick={() => setEditColor(item)} type="button"><span className={`color-swatch ${colorClass[item]}`} />{taken ? 'Taken' : colorLabel[item]}</button>; })}</div><label className="field-label" htmlFor="lobby-player-image">Profile image</label><input id="lobby-player-image" className="text-input" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setEditImage(String(reader.result)); reader.readAsDataURL(file); }} />{editImage && <img className="upload-preview" src={editImage} alt="Your profile preview" />}<button className="button-ghost" onClick={() => updatePlayer.mutate({ data: { name: editName.trim(), color: editColor, language: editLanguage, image: editImage }, params }, { onSuccess: patch, onError: (e) => setError(getErrorMessage(e)) })} disabled={updatePlayer.isPending || !editName.trim()} data-testid="button-save-player" type="button"><Settings2 size={16} /> Save identity</button></div>}
           <div className="lobby-actions"><button className="button-lime" onClick={toggleReady} disabled={setReady.isPending || !me} data-testid="button-toggle-ready" type="button">{me?.ready ? <><CheckCircle2 size={17} /> Ready</> : <><ShieldCheck size={17} /> Ready up</>}</button><span className="ready-note">{room.players.filter((player) => player.ready).length}/{room.players.length} players ready</span></div>
        </section>
        <aside className="lobby-side"><div className="panel"><h3>Waiting for the signal.</h3><p>Once every seat is ready, the room moves to the board automatically. Keep this tab open.</p><div className="mini-target"><span>Table size</span><strong>{room.targetCount} players</strong></div></div><div className="panel"><p className="eyebrow">YOU ARE</p><p style={{ marginTop: 7, color: 'hsl(var(--foreground))', fontWeight: 700 }}>{me?.name ?? 'Player'} <span style={{ color: colorHex[me?.color ?? 'red'] }}>●</span></p><p style={{ marginTop: 6 }}>{me?.host ? 'Host of this room' : 'Guest player'} · {me?.connected ? 'Connected' : 'Offline'}</p></div></aside>
      </div>
    </main>
  );
}

function PlayerRow({ player }: { player: PlayerState }) {
  return <div className="player-row" data-testid={`row-player-${player.id}`}><div className="player-avatar" style={{ background: colorHex[player.color], color: '#090b16' }}>{player.image ? <img className="avatar-image" src={player.image} alt="" /> : getInitials(player.name)}</div><div className="player-info"><strong>{player.name} {player.host && <span style={{ color: 'hsl(var(--secondary))' }}>· host</span>}</strong><span>{player.connected ? 'At the table' : 'Connection lost'}</span></div><span className={`status-pill ${player.ready ? 'ready' : ''} ${player.connected ? '' : 'offline'}`}>{player.ready ? <><Check size={12} /> Ready</> : player.connected ? 'Choosing' : 'Offline'}</span></div>;
}

function Board({ state, local, playerId, onMove }: { state: RoomState; local: boolean; playerId: string; onMove: (tokenIndex: number) => void }) {
  const cells = Array.from({ length: 225 }, (_, i) => {
    const row = Math.floor(i / 15); const col = i % 15;
    const home = row < 6 && col < 6 ? 'pink' : row < 6 && col > 8 ? 'lime' : row > 8 && col < 6 ? 'cyan' : row > 8 && col > 8 ? 'orange' : '';
    const center = row >= 6 && row <= 8 && col >= 6 && col <= 8;
    const path = (row >= 6 && row <= 8) || (col >= 6 && col <= 8);
    return <span className={`board-cell ${home} ${center ? 'center' : path ? 'path' : ''}`} key={i} />;
  });
  const me = state.players.find((player) => player.id === state.currentPlayer) ?? state.players[0];
  const canMove = state.gamePhase === 'moving' && state.currentPlayer === playerId;
  const tokens = me?.tokens ?? [0, 0, 0, 0];
  return <div className="ludo-board" data-testid="game-board"><div className="board-grid">{cells}</div>{tokens.map((_, index) => <button className={`board-token ${me?.color ?? 'red'} ${index === 0 ? 't1' : index === 1 ? 't2' : index === 2 ? 't3' : 't4'}`} onClick={() => onMove(index)} disabled={!canMove} key={index} title={`Move piece ${index + 1}`} data-testid={`button-board-piece-${index}`} type="button" />)}</div>;
}

function Game({ state: initialState, playerId, code, offline, onExit }: { state: RoomState; playerId: string; code: string; offline: boolean; onExit: () => void }) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState('');
  const [rolling, setRolling] = useState(false);
  const queryClient = useQueryClient();
  const params = useMemo(() => ({ code, playerId }), [code, playerId]);
  const rollDice = useRollLudoDice();
  const movePiece = useMoveLudoPiece();
  const stream = useRoomStream(offline ? '' : code, offline ? '' : playerId, setState);
  const me = state.players.find((player) => player.id === playerId) ?? state.players[0];
  const current = state.players.find((player) => player.id === state.currentPlayer);
  const aiTimer = useRef<number | undefined>(undefined);
  const apply = (next: RoomState) => { setState(next); if (!offline) queryClient.setQueryData(getGetLudoRoomQueryKey(params), next); };
  const roll = () => {
    if (state.currentPlayer !== playerId && !offline) return;
    setError(''); setRolling(true);
    if (offline) {
      window.setTimeout(() => { const value = Math.floor(Math.random() * 6) + 1; apply({ ...state, diceValue: value, gamePhase: 'moving', version: state.version + 1 }); setRolling(false); }, 450);
    } else rollDice.mutate({ params }, { onSuccess: (next) => { apply(next); setRolling(false); }, onError: (e) => { setError(getErrorMessage(e)); setRolling(false); } });
  };
  const move = (tokenIndex: number) => {
    if (offline) {
      const actor = state.players.find((player) => player.id === state.currentPlayer);
      if (!actor || state.diceValue === null) return;
      const old = actor.tokens[tokenIndex];
      const next = old < 0 ? (state.diceValue === 6 ? 0 : -1) : old + state.diceValue;
      if (next < 0 || next > 57) return;
      const players = state.players.map((player) => player.id === actor.id ? { ...player, tokens: player.tokens.map((token, index) => index === tokenIndex ? next : token), finished: player.finished + (next === 57 ? 1 : 0) } : player);
      const winner = players.find((player) => player.finished === 4)?.id ?? null;
      const currentIndex = players.findIndex((player) => player.id === actor.id);
      const extraTurn = state.diceValue === 6 && !winner;
      apply({ ...state, players, diceValue: null, winner, gamePhase: winner ? 'finished' : 'rolling', currentPlayer: winner ? actor.id : extraTurn ? actor.id : players[(currentIndex + 1) % players.length].id, version: state.version + 1 });
      return;
    }
    movePiece.mutate({ data: { tokenIndex }, params }, { onSuccess: apply, onError: (e) => setError(getErrorMessage(e)) });
  };
  const isAiTurn = offline && current?.id === 'ai' && state.gamePhase !== 'finished';
  useEffect(() => {
    if (!isAiTurn) return;
    aiTimer.current = window.setTimeout(() => {
      if (state.gamePhase === 'rolling') roll();
      else if (state.gamePhase === 'moving') {
        const actor = state.players.find((player) => player.id === state.currentPlayer);
        const selected = actor?.tokens.findIndex((token) => token < 0 ? state.diceValue === 6 : token + (state.diceValue ?? 0) <= 57) ?? -1;
        if (selected >= 0) move(selected);
      }
    }, 600);
    return () => { if (aiTimer.current) window.clearTimeout(aiTimer.current); };
  }, [isAiTurn, state.gamePhase, state.currentPlayer, state.diceValue, state.version]);
  const isMyTurn = state.currentPlayer === playerId || (offline && state.currentPlayer === 'local');
  return (
    <main className="screen app-content">
      <div className="game-shell">
        <section className="panel game-board-card">
          <div className="game-topline"><div><p className="eyebrow">ROOM {code}</p><h1>Make your move.</h1></div><span className="phase-badge" data-testid="status-game-phase">{state.gamePhase === 'rolling' ? 'ROLLING PHASE' : state.gamePhase === 'moving' ? 'CHOOSE A PIECE' : state.gamePhase.toUpperCase()}</span></div>
          {error && <div className="error-banner" data-testid="status-game-error"><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError('')} data-testid="button-dismiss-game-error" type="button"><X size={15} /></button></div>}
          <Board state={state} local={offline} playerId={offline ? 'local' : playerId} onMove={move} />
          <div className="game-footer"><span><Wifi size={13} /> {offline ? 'Local table · no connection needed' : stream === 'connected' ? 'Moves are live for everyone' : 'Trying to reconnect…'}</span><button onClick={onExit} data-testid="button-leave-game" type="button"><LogOut size={13} /> Leave game</button></div>
        </section>
        <aside className="game-side">
          <section className="panel turn-card"><p className="eyebrow">{state.winner ? 'WINNER' : 'CURRENT TURN'}</p><h2 data-testid="text-current-player">{state.winner ? state.players.find((player) => player.id === state.winner)?.name ?? 'Winner' : current?.name ?? 'Waiting…'}</h2><p>{state.winner ? 'That was a table-sized performance.' : isMyTurn ? 'Your table is listening.' : 'Watch closely. Your turn is next.'}</p>{state.gamePhase === 'rolling' ? <button className={`dice-button ${rolling ? 'rolling' : ''}`} onClick={roll} disabled={rolling || !isMyTurn} data-testid="button-roll-dice" type="button"><Dice5 size={25} /><strong>?</strong><span>{isMyTurn ? 'Roll the dice' : 'Waiting for player'}</span></button> : <div><div className="turn-alert" data-testid="text-dice-value">You rolled a {state.diceValue}. Pick a piece.</div><div className="piece-actions">{[0, 1, 2, 3].map((index) => <button className="piece-button" onClick={() => move(index)} disabled={!isMyTurn || movePiece.isPending} key={index} data-testid={`button-move-piece-${index}`} type="button">Piece {index + 1}</button>)}</div></div>}</section>
           <section className="panel players-card"><p className="card-title">At the table</p><div className="players-compact">{state.players.map((player) => <div className={`compact-player ${player.id === state.currentPlayer ? 'current' : ''}`} key={player.id}><div className="player-avatar" style={{ background: colorHex[player.color], color: '#090b16' }}>{player.image ? <img className="avatar-image" src={player.image} alt="" /> : getInitials(player.name)}</div><strong>{player.name}{player.id === playerId ? ' (you)' : ''}</strong><small>{player.finished}/4 home</small></div>)}</div></section>
          <section className="panel how-card"><p className="card-title">Quick rules</p><p>Roll six to release a piece. Land on a rival to send them home. First player to bring all four pieces around wins.</p></section>
        </aside>
      </div>
    </main>
  );
}

function AppContent() {
  const [view, setView] = useState<View>('home');
  const [room, setRoom] = useState<{ state: RoomState; playerId: string; code: string } | null>(null);
  const goHome = () => { setView('home'); setRoom(null); };
  return <div className="app-shell"><Topbar onHome={goHome} />{view === 'home' && <Home onChoose={(next) => { if (next === 'offline') setView('offline'); else setView('setup'); }} />}{view === 'setup' && <Setup onBack={goHome} onLobby={(next) => { setRoom(next); setView('lobby'); }} />}{view === 'lobby' && room && <Lobby initialState={room.state} playerId={room.playerId} code={room.code} onExit={goHome} onState={(state) => setRoom((old) => old ? { ...old, state } : old)} onStarted={(state) => { setRoom((old) => old ? { ...old, state } : old); setView('game'); }} />}{view === 'game' && room && <Game state={room.state} playerId={room.playerId} code={room.code} offline={room.code === 'OFFLINE'} onExit={goHome} />}{view === 'offline' && <OfflineSetup onBack={goHome} onStart={(players) => { const state = makeOfflineState(players); setRoom({ state, playerId: 'local', code: 'OFFLINE' }); setView('game'); }} />}</div>;
}

function OfflineSetup({ onBack, onStart }: { onBack: () => void; onStart: (players: OfflinePlayerConfig[]) => void }) {
  const [count, setCount] = useState(2);
  const [players, setPlayers] = useState<OfflinePlayerConfig[]>([
    { name: 'You', color: 'red', image: null },
    { name: 'Player 2', color: 'blue', image: null },
  ]);
  const updateCount = (next: number) => {
    setCount(next);
    setPlayers((current) => Array.from({ length: next }, (_, index) => current[index] ?? { name: `Player ${index + 1}`, color: colors[index], image: null }));
  };
  const update = (index: number, patch: Partial<OfflinePlayerConfig>) => setPlayers((current) => current.map((player, item) => item === index ? { ...player, ...patch } : player));
  return <main className="screen app-content"><div className="screen-head"><div><button className="back-button" onClick={onBack} data-testid="button-back-offline" type="button"><ArrowLeft size={15} /> Back to table</button><p className="eyebrow">OFFLINE PLAY / LOCAL TABLE</p><h1 className="screen-title">Set the<br /><span className="text-lime">table.</span></h1><p className="screen-subtitle">Choose a local mode. With two to four seats, every player is human.</p></div></div><section className="panel setup-card offline-setup-card"><div><span className="field-label">Game mode</span><div className="target-grid">{[1, 2, 3, 4].map((value) => <button className={`target-option ${count === value ? 'active' : ''}`} key={value} onClick={() => updateCount(value)} type="button" data-testid={`button-offline-count-${value}`}>{value === 1 ? '1 + KI' : `${value} players`}</button>)}</div></div><div className="offline-player-grid">{players.map((player, index) => <div className="offline-player-card" key={index}><p className="card-title">{index === 0 ? 'Player 1' : player.ai ? 'Computer' : `Player ${index + 1}`}</p><input className="text-input" value={player.name} maxLength={24} onChange={(e) => update(index, { name: e.target.value })} placeholder="Name" data-testid={`input-offline-name-${index}`} /><div className="color-grid compact-colors">{colors.map((item) => { const taken = players.some((other, otherIndex) => otherIndex !== index && other.color === item); return <button className={`color-option ${player.color === item ? 'active' : ''}`} disabled={taken} style={{ color: colorHex[item] }} key={item} onClick={() => update(index, { color: item })} type="button"><span className={`color-swatch ${colorClass[item]}`} />{colorLabel[item]}</button>; })}</div></div>)}</div><button className="button-lime form-submit" onClick={() => onStart(players.map((player, index) => ({ ...player, name: player.name.trim() || (index === 0 ? 'You' : `Player ${index + 1}`), ai: count === 1 && index === 1 })))} data-testid="button-start-offline" type="button"><Gamepad2 size={18} /> Start local game</button></section></main>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><AppContent /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;