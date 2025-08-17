import { useEffect, useRef, useState } from "react";
import { LoaderCircle, CircleX, Video, CirclePlay } from "lucide-react";
import { Log, FormatTag } from "webrtsp.ts/helpers/Log";
import { WebRTSPPlayer as Player } from "webrtsp.ts/WebRTSPPlayer";
import { WebRTSP } from "./useWebRTSP";

import "./WebRTSPPlayer.css";

const TAG = FormatTag("WebRTSP.Client");

const ConnectionState = {
  New: "new",
  Connecting: "connecting",
  Connected: "connected",
  Disconnected: "disconnected",
  Failed: "failed",
  Closed: "closed",
} as const;
type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

function WebRTSPPlayer(
  props: {
    webRTSP: WebRTSP,
    activeStreamer?: string,
    activeStreamerRev?: number,
    incActiveStreamerRev: () => void,
  }
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player>(undefined);
  type OptionalConnectionState = ConnectionState | undefined;
  const [connectionState, setConnectionState] = useState<OptionalConnectionState>();
  const [canPlay, setCanPlay] = useState(false);
  const webRTSP = props.webRTSP;
  const activeStreamer = props.activeStreamer;
  const activeStreamerRev = props.activeStreamerRev;
  const incActiveStreamerRev = props.incActiveStreamerRev;

  useEffect(() => {
    const video = videoRef.current;
    if(
      !video ||
      !webRTSP.connection || !webRTSP.connected ||
      !activeStreamer
    ) {
      return;
    }

    let active = true;

    setConnectionState(ConnectionState.New);

    video.addEventListener("canplay", () => {
      if(active) {
        setCanPlay(true);
      }
    });

    const player = new Player(
      webRTSP.connection,
      [{
        urls: ["stun:stun.l.google.com:19302"]
      }],
      activeStreamer,
      video,
    );
    playerRef.current = player;

    player.events.addEventListener("connectionstatechanged", (event) => {
      if(!(event instanceof CustomEvent))
        return;

      if(active) {
        setConnectionState(event.detail.connectionstate);
      }
    });

    player.play().catch((error: unknown) => {
      Log.error(TAG, "play() failed:", error);
      if(active) {
        setConnectionState(ConnectionState.Failed);
      }
    });

    return () => {
      active = false;
      player.stop();
      setConnectionState(undefined);
      setCanPlay(false);
      playerRef.current = undefined;
    };

  }, [
    webRTSP.connection,
    webRTSP.connected,
    activeStreamer,
    activeStreamerRev
  ]);

  const idle = activeStreamer == undefined;

  const loading = connectionState &&
    ([
      ConnectionState.New,
      ConnectionState.Connecting,
      ConnectionState.Disconnected
    ] as string[]).includes(connectionState);

  const playing = connectionState &&
    ([
      ConnectionState.Connected,
      ConnectionState.Disconnected,
      ConnectionState.Closed,
    ] as string[]).includes(connectionState);
  const canRestart = connectionState &&
    ([
      ConnectionState.Closed,
    ] as string[]).includes(connectionState);
  const failed = connectionState == ConnectionState.Failed;

  const stateIconClassNameCommon = `
    absolute
    max-w-1/2 max-h-1/2
    w-40 h-40
    top-0 bottom-0 left-0 right-0
    m-auto`;

  return (
    <>
    {
      idle && <Video
        className = {`
          ${stateIconClassNameCommon}
          stroke-primary-500
        `}/>
    }
    {
      failed && <CircleX
        className = {`
          ${stateIconClassNameCommon}
          stroke-destructive-500
        `}
      />
    }
    <video
      className = {`
        absolute
        max-w-full max-h-full
        top-0 bottom-0 left-0 right-0
        m-auto
        bg-black
      `}
      ref = { videoRef } muted autoPlay hidden = { !playing || !canPlay } />
    {
      (loading || (playing && !canPlay && !canRestart)) && <LoaderCircle
        className = {`
          ${stateIconClassNameCommon}
          stroke-primary-200
          animate-spin
        `}
      />
    }
    {
      canRestart && <CirclePlay
        className = {`
          ${stateIconClassNameCommon}
          stroke-primary-transparent-400
          hover:stroke-primary-transparent-700
        `}
        onClick = {() => {
          incActiveStreamerRev();
        }}
      />
    }
    </>
  );
}

export default WebRTSPPlayer;
