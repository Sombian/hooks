"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ON_GOING = new Set<string>();

const enum RequestType
{
	SYNC,
	ASSIGN,
	ALLOCATE,
}

class Request<T>
{
	constructor(readonly type: RequestType, readonly path: string, readonly data?: T)
	{
		// TODO: none
	}
}

const enum ResponseType
{
	EMPTY,
	LOADING,
	SUCCESS,
}

class Response<T>
{
	constructor(readonly type: ResponseType, readonly path: string, readonly data: T)
	{
		// TODO: none
	}
}

/** @see https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem */
const WORKER = new SharedWorker("data:text/javascript;base64," + btoa(String.fromCodePoint(...new TextEncoder().encode(
	"("
	+
	function ()
	{
		"use strict";

		const ports: MessagePort[] = []; const store = new Map<string, "init" | { since: number; value: unknown; }>();

		// @ts-ignore
		self.addEventListener("connect", (event: MessageEvent) =>
		{
			const port = event.ports[0];

			port.addEventListener("message", (event) =>
			{
				const request: Request<unknown> = event.data;

				switch (request.type)
				{
					case RequestType.SYNC:
					{
						if (!store.has(request.path))
						{
							port.postMessage(new Response(ResponseType.EMPTY, request.path, null));
						}
						else
						{
							const cache = store.get(request.path)!;

							if (cache === "init")
							{
								port.postMessage(new Response(ResponseType.LOADING, request.path, null));
							}
							else
							{
								port.postMessage(new Response(ResponseType.SUCCESS, request.path, cache.value));
							}
						}
						break;
					}
					case RequestType.ASSIGN:
					{
						store.set(request.path, { since: Date.now(), value: request.data });

						for (const tab of ports)
						{
							if (port !== tab)
							{
								tab.postMessage(new Response(ResponseType.SUCCESS, request.path, request.data));
							}
						}
						break;
					}
					case RequestType.ALLOCATE:
					{
						store.set(request.path, "init");

						for (const tab of ports)
						{
							if (port !== tab)
							{
								tab.postMessage(new Response(ResponseType.LOADING, request.path, null));
							}
						}
						break;
					}
				}
			});
			// "LINK STATO..!"
			ports.push(port); port.start();
		});
	}
	.toString()
	+
	")()"
))));
// ..!
WORKER.port.start();

export default function useQuery<T>(fetcher: () => Promise<T>, options: { retry?: number; expire?: number; refresh_on_focus?: boolean; refresh_on_interval?: number; refresh_on_reconnect?: boolean; } = {})
{
	const key = useRef<string>(); const [data, set_data] = useState<T>();

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker */
	useEffect(() =>
	{
		function handle(event: MessageEvent)
		{
			const response: Response<T> = event.data;
			//
			// STEP 2. match key & value
			//
			if (response.path === key.current)
			{
				switch (response.type)
				{
					case ResponseType.EMPTY:
					{
						//
						// STEP 3. dedupe
						//
						if (!ON_GOING.has(key.current))
						{
							//
							// STEP 4. prevent duplication
							//
							ON_GOING.add(key.current);
							//
							// STEP 5. allocate cache
							//
							WORKER.port.postMessage(new Request(RequestType.ALLOCATE, key.current));
							//
							// STEP 6. fetch data
							//
							fetcher().then((data) =>
							{
								//
								// STEP 7. reflect fetcher
								//
								set_data(data);
								//
								// STEP 8. allow duplication
								//
								ON_GOING.delete(key.current as string);
								//
								// STEP 9. update cache
								//
								WORKER.port.postMessage(new Request(RequestType.ASSIGN, key.current as string, data));
							});
						}
						break;
					}
					case ResponseType.SUCCESS:
					{
						//
						// STEP 3. compare data
						//
						if (response.data !== data)
						{
							//
							// STEP 4. reflect response
							//
							set_data(response.data);
						}
						break;
					}
				}
				// console.debug(response);
			}
		}
		WORKER.port.addEventListener("message", handle);
		return () => WORKER.port.removeEventListener("message", handle);
	},
	[key, data, fetcher]);

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API */
	useEffect(() =>
	{
		function handle(event: Event)
		{
			//
			// STEP 1. synchronize
			//
			if (key.current && !document.hidden)
			{
				WORKER.port.postMessage(new Request(RequestType.SYNC, key.current));
			}
		}
		document.addEventListener("visibilitychange", handle);
		return () => document.removeEventListener("visibilitychange", handle);
	},
	[key]);

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine */
	useEffect(() =>
	{
		function handle(event: Event)
		{
			//
			// STEP 1. synchronize
			//
			if (key.current && navigator.onLine)
			{
				WORKER.port.postMessage(new Request(RequestType.SYNC, key.current));
			}
		}
		window.addEventListener("online", handle);
		return () => window.removeEventListener("online", handle);
	},
	[key]);

	useEffect(() =>
	{
		hash(fetcher.toString()).then((sha256) =>
		{
			key.current = sha256;
			//
			// STEP 1. synchronize
			//
			if (navigator.onLine)
			{
				WORKER.port.postMessage(new Request(RequestType.SYNC, key.current));
			}
		});
	},
	[fetcher]);

	return { data };
}

async function hash(value: string)
{
	return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
