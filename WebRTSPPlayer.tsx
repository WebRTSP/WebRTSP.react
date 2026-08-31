import { useEffect, useRef, useState } from "react";
import {
  LoaderCircleIcon,
  VideoOffIcon,
  CirclePlayIcon
} from "lucide-react";
import { Log, FormatTag } from "webrtsp.ts/helpers/Log";
import { WebRTSPPlayer as Player } from "webrtsp.ts/WebRTSPPlayer";
import { type Credentials } from "webrtsp.ts/Types"
import { URIInfoStatus, WebRTSP, type URIInfo } from "./useWebRTSP";

const TAG = FormatTag("WebRTSP.Client");

const DefaultIceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];

const ConnectionState = {
  New: "new",
  Connecting: "connecting",
  Connected: "connected",
  Disconnected: "disconnected",
  Failed: "failed",
  Closed: "closed",
} as const;
type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

const WebRTSPPlayerStatus = {
  IDLE: "idle",
  LOADING: "loading",
  PLAYING: "playing",
  FAILED: "failed",
} as const;
type WebRTSPPlayerStatus = typeof WebRTSPPlayerStatus[keyof typeof WebRTSPPlayerStatus];

function URIInfo2PlayerStatus(uriInfo: URIInfo | undefined) {
  let playerStatus: WebRTSPPlayerStatus;
  switch(uriInfo?.status) {
    case URIInfoStatus.FETCHING:
      playerStatus = WebRTSPPlayerStatus.LOADING;
      break;
    case URIInfoStatus.FETCHED:
      playerStatus = WebRTSPPlayerStatus.PLAYING;
      break;
    case URIInfoStatus.ERROR:
      playerStatus = WebRTSPPlayerStatus.FAILED;
      break;
    default:
      playerStatus = WebRTSPPlayerStatus.IDLE;
      break;
  }

  return playerStatus;
}

export default function WebRTSPPlayer(
  props: {
    className?: string,
    webRTSP: WebRTSP,
    uri?: string,
    credentials?: Credentials,
    revision?: number,
    incActiveStreamerRev: () => void,
    iceServers?: RTCIceServer[],
  }
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player>(undefined);
  const [connectionState, setConnectionState] = useState<ConnectionState | undefined>();
  const [canPlay, setCanPlay] = useState(false);

  const { connected, connection, uriInfo: getUriInfo, ensureFetched } = props.webRTSP;
  const uri = props.uri;
  const credentials = props.credentials;
  const revision = props.revision;

  const uriInfo = uri ? getUriInfo(uri) : undefined;
  const uriInfoFetched = uriInfo?.status == URIInfoStatus.FETCHED;
  const forceStatus = URIInfo2PlayerStatus(uriInfo);

  const forceIdle = forceStatus == WebRTSPPlayerStatus.IDLE;
  const forceLoading = forceStatus == WebRTSPPlayerStatus.LOADING;
  const forceFailed = forceStatus == WebRTSPPlayerStatus.FAILED;

  const incActiveStreamerRev = props.incActiveStreamerRev;
  const iceServers = props.iceServers || DefaultIceServers;

  useEffect(() => {
    if(!uri || uriInfoFetched)
      return;

    let isMounted = true;

    (async () => {
      for(;;) {
        if(!isMounted)
          break;

        if(ensureFetched(uri, false))
          break;

        const retryDelay = Math.floor(2000 + 3000 * Math.random());
        await (new Promise((resolve) => setTimeout(resolve, retryDelay)));
      };
    })();

    return () => {
      isMounted = false;
    };
  }, [uri, uriInfoFetched, ensureFetched]);

  useEffect(() => {
    const video = videoRef.current;
    if(
      !video ||
      !connection || !connected ||
      !uri ||
      forceStatus != WebRTSPPlayerStatus.PLAYING
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
      connection,
      iceServers,
      uri,
      credentials,
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
    connected,
    connection,
    uri,
    credentials,
    revision,
    iceServers,
    forceStatus,
  ]);

  const idle = forceIdle || !uri;

  const loading = forceLoading ||
    (connectionState && ([
      ConnectionState.New,
      ConnectionState.Connecting,
      ConnectionState.Disconnected
    ] as string[]).includes(connectionState));

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
  const failed = forceFailed || connectionState == ConnectionState.Failed;

  const stateIconClassNameCommon = `
    absolute
    max-w-1/2 max-h-1/2
    w-40 h-40
    top-0 bottom-0 left-0 right-0
    m-auto`;

  return (
    <div className = { `relative ${props.className}` }>
      {
        idle && <VideoOffIcon
          className = {`
            ${stateIconClassNameCommon}
            stroke-primary
            opacity-50
          `}/>
      }
      {
        failed && <VideoOffIcon
          className = {`
            ${stateIconClassNameCommon}
            stroke-destructive
            opacity-60
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
        (loading || (playing && !canPlay && !canRestart)) && <LoaderCircleIcon
          className = {`
            ${stateIconClassNameCommon}
            stroke-primary
            opacity-50
            animate-spin
          `}
        />
      }
      {
        canRestart && <CirclePlayIcon
          className = {`
            ${stateIconClassNameCommon}
            stroke-primary
            opacity-60
            hover:stroke-primary
            hover:opacity-30
          `}
          onClick = {() => {
            incActiveStreamerRev();
          }}
        />
      }
    </div>
  );
}
