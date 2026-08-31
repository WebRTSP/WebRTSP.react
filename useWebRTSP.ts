import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { WebRTSPClient } from "webrtsp.ts/WebRTSPClient";
import { Method, Options, URI2Description, type Credentials } from "webrtsp.ts/Types";
import { useLazyRef } from "./useLazyRef";

export const URIInfoStatus = {
  FETCHING: "fetching",
  FETCHED: "fetched",
  ERROR: "error",
} as const;

export interface URIInfo {
  status: typeof URIInfoStatus[keyof typeof URIInfoStatus]
  options: Options
  list: URI2Description | undefined
}

export class URI2Info extends Map<string, URIInfo> {}

export class WebRTSP {
  connected: boolean = false;
  connection?: WebRTSPClient;
  uriInfo: (uri: string) => URIInfo | undefined = () => { return undefined; };
  fetchUriInfo: (
    uri: string,
    fetchList: boolean,
  ) => Promise<URIInfo | undefined> = () => { return Promise.resolve(undefined); };
  ensureFetched: (
    uri: string,
    withList: boolean
  ) => boolean = () => { return false; };
}

export function useWebRTSP(url: string | undefined, credentials?: Credentials): WebRTSP {
  const clientRef = useRef<WebRTSPClient>(undefined);
  const [client, setClient] = useState<WebRTSPClient | undefined>(undefined);
  const urisInfosRef = useLazyRef(() => new URI2Info());
  const [urisInfosRev, setUrisInfosRev] = useState(0);

  const incUrisInfosRev = () => {
    setUrisInfosRev((rev: number) => {
      return rev >= Number.MAX_SAFE_INTEGER ? 0 : rev + 1;
    });
  };

  useEffect(() => {
    if(!url)
      return;

    const client = new WebRTSPClient(url);
    clientRef.current = client;

    let active = true;

    const resetState = () => {
      clientRef.current = undefined;
      setClient(undefined);
      urisInfosRef.current.clear();
      incUrisInfosRev();
    };

    client.onConnected = () => {
      if(active) {
        clientRef.current = client;
        setClient(client);
      }
    };
    client.onDisconnected = () => {
      if(active)
        resetState();
    };
    client.connect();

    return () => {
      active = false;
      client.disconnect().catch(() => {});
      resetState();
    };
  }, [url, urisInfosRef]);

  const uriInfo = useCallback((uri: string): URIInfo | undefined => {
    (void urisInfosRev); // urisInfosRef is tightly bound to urisInfosRev

    const urisInfos = urisInfosRef.current;
    return urisInfos.get(uri);
  }, [urisInfosRef, urisInfosRev]);

  const fetchUriInfo = useCallback(async (
    uri: string,
    fetchList: boolean,
  ): Promise<URIInfo | undefined> => {
    if(!client)
      return undefined;

    if(client !== clientRef.current)
      return undefined;

    const urisInfos = urisInfosRef.current;
    let uriInfo  = urisInfos.get(uri);
    if(!uriInfo) {
       uriInfo = {
        status: URIInfoStatus.FETCHING,
        options: new Options,
        list: undefined,
      };
      urisInfos.set(uri, uriInfo);
    } else if(uriInfo.status != URIInfoStatus.FETCHING) {
      uriInfo.status = URIInfoStatus.FETCHING;
    } else {
      return uriInfo;
    }

    incUrisInfosRev();

    try {
      const options = await client.OPTIONS(uri, credentials);
      uriInfo.options = options;

      if(client !== clientRef.current)
        return;

      if(fetchList) {
        if(options && options.has(Method.LIST)) {
          const list = await client.LIST(uri, credentials);
          uriInfo.list = list;
        } else {
          uriInfo.list = new URI2Description;
        }
      } else {
          uriInfo.list = undefined;
      }

      uriInfo.status = URIInfoStatus.FETCHED;
    } catch {
      uriInfo.status = URIInfoStatus.ERROR;
    } finally {
      if(client === clientRef.current)
        incUrisInfosRev();
    }

    return uriInfo;
  }, [credentials, client, urisInfosRef]);

  const ensureFetched = useCallback((
    uri: string,
    withList: boolean,
  ): boolean => {
    if(!client)
      return false;

    if(client !== clientRef.current)
      return false;

    const urisInfos = urisInfosRef.current;
    let uriInfo = urisInfos.get(uri);
    if(uriInfo &&
      uriInfo.status == URIInfoStatus.FETCHED &&
      (!withList || !!uriInfo.list))
    {
      return true;
    }

    fetchUriInfo(uri, withList);

    return false;
  }, [client, urisInfosRef, fetchUriInfo]);

  return useMemo(() => ({
    connected: !!client,
    connection: client,
    uriInfo,
    fetchUriInfo,
    ensureFetched,
  } as const), [client, uriInfo, fetchUriInfo, ensureFetched]);
}
