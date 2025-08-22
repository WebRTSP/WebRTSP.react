import { useState, useRef, useEffect, useCallback } from "react";
import { WebRTSPClient } from "webrtsp.ts/WebRTSPClient";
import { Method, Options, URI2Description } from "webrtsp.ts/Types";
import { Log, FormatTag } from "webrtsp.ts/helpers/Log";
import { useLazyRef } from "./useLazyRef";

const TAG = FormatTag("useWebRTSP");

export interface URIInfo {
  fetching: boolean
  options: Options
  list: URI2Description
}

export class URI2Info extends Map<string, URIInfo> {}

export class WebRTSP {
  connection?: WebRTSPClient;
  connected: boolean = false;
  rootOptions = new Options();
  rootList = new URI2Description();
  urisInfos = new URI2Info();
  fetchList: (uri: string) => Promise<void> = () => { return Promise.resolve(); };
}

export function useWebRTSP(url: string): WebRTSP {
  const clientRef = useRef<WebRTSPClient>(undefined);
  const [connected, setConnected] = useState(false);
  const [rootOptions, setRootOptions] = useState(() => new Options());
  const [rootList, setRootList] = useState(() => new URI2Description());
  const urisInfosRef = useLazyRef(() => new URI2Info());
  const [, setUrisInfosRev] = useState(0);

  const incUrisInfosRev = () => {
    setUrisInfosRev((rev: number) => {
      return rev >= Number.MAX_SAFE_INTEGER ? 0 : rev + 1;
    });
  };

  useEffect(() => {
    clientRef.current = new WebRTSPClient(url);

    let active = true;

    const resetState = () => {
      setRootOptions(new Options());
      setRootList(new URI2Description());
      urisInfosRef.current.clear();
      incUrisInfosRev();
    };

    const client = clientRef.current;
    client.onConnected = () => {
      if(active) {
        setConnected(true);
      }
    };
    client.onDisconnected = () => {
      if(active) {
        setConnected(false);
        resetState();
      }
    };
    client.connect();

    return () => {
      active = false;
      client.disconnect().catch();
      clientRef.current = undefined;
      setConnected(false);
      resetState();
    };
  }, [url]);

  useEffect(() => {
    const client = clientRef.current;
    if(!client || !connected)
      return;

    let ignoreResult = false;

    const fetchOptions = async () => {
      try {
        const rootOptions = await client.OPTIONS("*");
        if(ignoreResult)
          return;

        setRootOptions(rootOptions);
        if(rootOptions.has(Method.LIST)) {
          const list = await client.LIST("*");
          if(ignoreResult)
            return;

          setRootList(list);

          const urisInfo = new URI2Info();
          for (const [key] of list) {
            const uriOptions = await client.OPTIONS(key);
            urisInfo.set(key, {
              fetching: false,
              options: uriOptions,
              list: new URI2Description(),
            });

            if(ignoreResult)
              return;
          }

          urisInfosRef.current = urisInfo;
          incUrisInfosRev();
        }
      } catch(e: unknown) {
        Log.error(TAG, e);
      }
    };

    fetchOptions();

    return () => {
      ignoreResult = true;
    };
  }, [clientRef, connected]);

  const fetchList = useCallback(async (uri: string) => {
    const client = clientRef.current;
    if(!client || !connected)
      return;

    const urisInfos = urisInfosRef.current;
    const uriInfo = urisInfos.get(uri);
    if(!uriInfo)
      return;

    uriInfo.fetching = true;

    incUrisInfosRev();

    const list = await client.LIST(uri);
    uriInfo.list = list;
    uriInfo.fetching = false;

    incUrisInfosRev();
  }, [connected]);

  return {
    connection: clientRef.current,
    connected,
    rootOptions,
    rootList,
    urisInfos: urisInfosRef.current,
    fetchList,
  };
}
