"use client";

import { useCallback, useEffect, useState, useRef } from "react";

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

		const PORTS: MessagePort[] = []; const STORE = new Map<string, "init" | { since: number; value: unknown; }>();

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
						if (!STORE.has(request.key))
						{
							port.postMessage(new Response(ResponseType.EMPTY, request.key, null));
						}
						else
						{
							const cache = STORE.get(request.key)!;

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
						STORE.set(request.key, { since: Date.now(), value: request.value });

						for (const entry of PORTS)
						{
							if (port !== entry)
							{
								entry.postMessage(new Response(ResponseType.SUCCESS, request.key, request.value));
							}
						}
						break;
					}
					case RequestType.ALLOCATE:
					{
						STORE.set(request.key, "init");

						for (const entry of PORTS)
						{
							if (port !== entry)
							{
								entry.postMessage(new Response(ResponseType.LOADING, request.key, null));
							}
						}
						break;
					}
				}
			});
			// "LINK STATO..!"
			PORTS.push(port); port.start();
		});
	}
	.toString()
	+
	")()"
))));
// ..!
WORKER.port.start();

interface QueryState<T>
{
	data?: T;
	error?: Error;
	isLoading: boolean;
	isValidating: boolean;
}

interface QueryOption<T, D>
{
	/** how many times should fetcher retry if an error occurs? */
	retry?: number;
	/** how long will it took for cache to be considered stale? */
	expire?: number;
	/** should it suspense? */
	suspense?: boolean;
	/** should it sync when you focus the tab? */
	sync_on_focus?: boolean;
	/** should it sync even if the tab is hidden? */
	sync_on_hidden?: boolean;
	/** should it refetch on certain interval clock? */
	refetch_on_interval?: number;
	/** should it refetch when network is back online? */
	refetch_on_reconnect?: boolean;
	/** refine response */
	extract?: (_: T) => D;
}

export default function useQuery<T, D = T>(fetcher: () => Promise<T>, criteria: React.DependencyList,
{
	retry = 0,
	expire = 60000,
	suspense = false,
	sync_on_focus = true,
	sync_on_hidden = true,
	refetch_on_interval = NaN,
	refetch_on_reconnect = true,
	extract = ((_) => _ as unknown as D),
}
: QueryOption<T, D>)
{
	const key = useRef<string>();
	
	const [state, setState] = useState<QueryState<D>>({ isLoading: true, isValidating: true });
	
	const subscribe = useRef<Set<keyof typeof state>>(new Set()); const suspenser = useRef(defer());
	//
	// cherry-pick update
	//
	const update = useCallback(<K extends keyof typeof state>(key: K, value: typeof state[K]) =>
	{
		// TODO: deep compare objects
		if (state[key] === value) return;

		// silent update
		state[key] = value;

		// re-render
		if (subscribe.current.has(key))
		{
			setState((_) => ({..._ }))
		}
	},
	[]);

	useEffect(() =>
	{
		function handle(event: MessageEvent)
		{
			const response: Response<T> = event.data;

			// STEP 3. match key & value
			if (key.current === response.key)
			{
				switch (response.type)
				{
					case ResponseType.EMPTY:
					{
						// STEP 4. dedupe
						if (!ON_GOING.has(key.current))
						{
							// STEP 5. reflect
							update("isValidating", true);

							// STEP 5. de-dupe requests
							ON_GOING.add(key.current);

							// STEP 6. allocate cache
							WORKER.port.postMessage(new Request(RequestType.ALLOCATE, key.current));

							// STEP 8. fetch
							(function recursive(retries: number)
							{
								fetcher().then((data) =>
								{
									const signal = extract(data);

									// STEP 9. reflect response
									update("data", signal);

									// STEP 10. update status
									update("isLoading", false);
									update("isValidating", false);

									// STEP 11. allow request
									ON_GOING.delete(key.current as string);

									// STEP 12. update cache
									WORKER.port.postMessage(new Request(RequestType.ASSIGN, key.current as string, data));
								})
								.catch((error) =>
								{
									if (retries >= retry)
									{
										// STEP ?. reflect response
										update("error", error);

										// STEP ?. update status
										update("isLoading", false);
										update("isValidating", false);
									}
									else
									{
										// STEP ?. refetch
										recursive(retries + 1);
									}
								});
							})
							(0);
						}
						break;
					}
					case ResponseType.LOADING:
					{
						// STEP 4. update status
						// update("isLoading", true);
						update("isValidating", true);
						break;
					}
					case ResponseType.SUCCESS:
					{
						// STEP 4. compare data
						if (state.data !== response.value)
						{
							const signal = extract(response.value);

							// STEP 5. reflect response
							update("data", signal);

							// STEP 6. update status
							update("isLoading", false);
							update("isValidating", false);
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
	[fetcher]);

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API */
	useEffect(() =>
	{
		function handle(event: Event)
		{
			// STEP 2. synchronize
			if (key.current && !document.hidden)
			{
				WORKER.port.postMessage(new Request(RequestType.SYNC, key.current));
			}
		}
		document.addEventListener("visibilitychange", handle);
		return () => document.removeEventListener("visibilitychange", handle);
	},
	[key.current]);

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine */
	useEffect(() =>
	{
		function handle(event: Event)
		{
			// STEP 2. synchronize
			if (key.current && !document.hidden)
			{
				WORKER.port.postMessage(new Request(RequestType.SYNC, key.current));
			}
		}
		window.addEventListener("online", handle);
		return () => window.removeEventListener("online", handle);
	},
	[key.current]);

	useEffect(() =>
	{
		hash(fetcher.toString(), "SHA-256").then((sha256) =>
		{
			// STEP 1. hash
			key.current = [sha256, JSON.stringify(criteria)].join("=");

			// STEP 2. synchronize
			WORKER.port.postMessage(new Request(RequestType.SYNC, key.current));
		});
	},
	[fetcher, criteria]);

	if (suspense && state.isLoading)
	{
		throw suspenser.current.promise;
	}

	return {
		get data()
		{
			subscribe.current.add("data"); return state.data;
		},
		get error()
		{
			subscribe.current.add("error"); return state.error;
		},
		get isLoading()
		{
			subscribe.current.add("isLoading"); return state.isLoading;
		},
		get isValidating()
		{
			subscribe.current.add("isValidating"); return state.isValidating;
		},
	} as typeof state;
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
	// converts an ArrayBuffer to a hex string
	return Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
