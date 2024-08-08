"use client";

import { useEffect, useState, useRef } from "react";

const ON_GOING = new Set<string>();

const enum RequestType
{
	SYNC,
	ASSIGN,
	ALLOCATE,
}

class Request<T>
{
	constructor(readonly type: RequestType, readonly key: string, readonly value?: T)
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
	constructor(readonly type: ResponseType, readonly key: string, readonly value: T)
	{
		// TODO: none
	}
}

/** @see https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem */
const WORKER = new SharedWorker("data:text/javascript;base64," + btoa(String.fromCodePoint(...new TextEncoder().encode(
	"("
	+
	/** @see https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker */
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
						if (!store.has(request.key))
						{
							port.postMessage(new Response(ResponseType.EMPTY, request.key, null));
						}
						else
						{
							const cache = store.get(request.key)!;

							if (cache === "init")
							{
								port.postMessage(new Response(ResponseType.LOADING, request.key, null));
							}
							else
							{
								port.postMessage(new Response(ResponseType.SUCCESS, request.key, cache.value));
							}
						}
						break;
					}
					case RequestType.ASSIGN:
					{
						store.set(request.key, { since: Date.now(), value: request.value });

						for (const tab of ports)
						{
							if (port !== tab)
							{
								tab.postMessage(new Response(ResponseType.SUCCESS, request.key, request.value));
							}
						}
						break;
					}
					case RequestType.ALLOCATE:
					{
						store.set(request.key, "init");

						for (const tab of ports)
						{
							if (port !== tab)
							{
								tab.postMessage(new Response(ResponseType.LOADING, request.key, null));
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

export default function useQuery<T, D>(fetcher: () => Promise<T>, options: { retry?: number; expire?: number; suspense?: boolean; refresh_on_focus?: boolean; refresh_on_interval?: number; refresh_on_reconnect?: boolean; extract?: (data: T) => D; onError?: (error: Error) => void; onSuccess?: (data: T) => void; } = {})
{
	const key = useRef<string>(); const state = useRef<{ data?: D; error?: Error; isLoading: boolean; isFetching: boolean; }>({ isLoading: true, isFetching: true }); const suspenser = useRef(defer()); const dependencies = useRef<Set<string>>(new Set());

	const { data, error, isLoading, isFetching } = state.current;
	//
	// for <Suspense/> component
	//
	if (isLoading && options.suspense)
	{
		throw suspenser.current.promise;
	}

	useEffect(() =>
	{
		function handle(event: MessageEvent)
		{
			const response: Response<T> = event.data;
			//
			// STEP 3. match key & value
			//
			if (key.current === response.key)
			{
				switch (response.type)
				{
					case ResponseType.EMPTY:
					{
						//
						// STEP 4. dedupe
						//
						if (!ON_GOING.has(key.current))
						{
							//
							// STEP 5. prevent duplication
							//
							ON_GOING.add(key.current);
							//
							// STEP 6. allocate cache
							//
							WORKER.port.postMessage(new Request(RequestType.ALLOCATE, key.current));
							//
							// STEP 7. fetch data
							//
							fetcher().then((data) =>
							{
								//
								// STEP 8. reflect fetcher
								//
								setData(data);
								//
								// STEP 9. allow duplication
								//
								ON_GOING.delete(key.current as string);
								//
								// STEP 10. update cache
								//
								WORKER.port.postMessage(new Request(RequestType.ASSIGN, key.current as string, data));
							})
							.catch((error) =>
							{
								// TODO: retry
							});
						}
						break;
					}
					case ResponseType.SUCCESS:
					{
						//
						// STEP 4. compare data
						//
						if (data !== response.value)
						{
							//
							// STEP 5. reflect response
							//
							setData(response.value);
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
	[data, fetcher]);

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API */
	useEffect(() =>
	{
		function handle(event: Event)
		{
			//
			// STEP 2. synchronize
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
			// STEP 2. synchronize
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
		hash(fetcher.toString(), "SHA-256").then((sha256) =>
		{
			//
			// STEP 1. hash
			//
			key.current = sha256;
			//
			// STEP 2. synchronize
			//
			WORKER.port.postMessage(new Request(RequestType.SYNC, key.current));
		});
	},
	[fetcher]);

	return {
		get data()
		{
			dependencies.current.add("data"); return data;
		},
		get error()
		{
			dependencies.current.add("error"); return error;
		},
		get isLoading()
		{
			dependencies.current.add("isLoading"); return isLoading;
		},
		get isFetching()
		{
			dependencies.current.add("isFetching"); return isFetching;
		},
	};
}

/** @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers */
function defer()
{
	let resolver!: Parameters<ConstructorParameters<typeof Promise>[0]>[0];
	let rejecter!: Parameters<ConstructorParameters<typeof Promise>[0]>[1];

	const promise = new Promise((resolve, reject) =>
	{
		resolver = resolve;
		rejecter = reject;
	});

	return { promise, resolve: resolver, reject: rejecter };
}

/** @see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest */
async function hash(value: string, algorithm: AlgorithmIdentifier)
{
	//
	// converts an ArrayBuffer to a hex string
	//
	return Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
