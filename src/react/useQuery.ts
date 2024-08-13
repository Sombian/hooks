"use client";

import { useCallback, useEffect, useState, useRef } from "react";

const ON_GOING = new Set<string>();

const enum RequestType
{
	SYNC,
	ASSIGN,
	ALLOCATE,
}

interface Request<T>
{
	readonly type: RequestType; readonly key: string; readonly value: T;
}

const enum ResponseType
{
	EMPTY,
	LOADING,
	SUCCESS,
}

interface Response<T>
{
	readonly type: ResponseType, readonly key: string, readonly value: T;
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

		// @ts-expect-error why..?
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
							port.postMessage({ type: ResponseType.EMPTY, key: request.key, value: null } satisfies Response<typeof request.value>);
						}
						else
						{
							const cache = STORE.get(request.key)!;

							if (cache === "init")
							{
								port.postMessage({ type: ResponseType.LOADING, key: request.key, value: null } satisfies Response<typeof request.value>);
							}
							else
							{
								port.postMessage({ type: ResponseType.SUCCESS, key: request.key, value: cache.value } satisfies Response<typeof request.value>);
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
								entry.postMessage({ type: ResponseType.SUCCESS, key: request.key, value: request.value } satisfies Response<typeof request.value>);
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
								entry.postMessage({ type: ResponseType.LOADING, key: request.key, value: null } satisfies Response<typeof request.value>);
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
)))).port;
// ..!
WORKER.start();

interface QueryState<T>
{
	data?: T;
	error?: Error;
	isLoading: boolean;
	isValidating: boolean;
}

interface QueryOption<T, D>
{
	/** How many times can the fetcher retry if an error occurs? */
	retry?: number;
	/** How long before the cache is considered stale (unit: ms)? */
	expire?: number;
	/** Should the query use <React.Suspense> for loading states? */
	suspense?: boolean;
	/** Should the query sync data when the tab gains focus? */
	sync_on_focus?: boolean;
	/** Should the query sync data even if the tab is hidden? */
	sync_on_hidden?: boolean;
	/** Should the query refetch data at regular intervals? */
	refetch_on_interval?: number;
	/** Should the query refetch data when reconnects? */
	refetch_on_reconnect?: boolean;
	/** Function to transform the response data */
	extract?: (data: T) => D;
	/** Function to call on failed request */
	onError?: (error: Error) => void;
	/** Function to call on successful request */
	onSuccess?: (data: T) => void;
}

export default function useQuery<T, D = T>(fetcher: () => Promise<T>, dependencies: React.DependencyList = [],
{
	retry = 0,
	/*
	expire = 60000,
	suspense = false,
	sync_on_focus = true,
	sync_on_hidden = true,
	refetch_on_interval = NaN,
	refetch_on_reconnect = true,
	*/
	extract = (_) => _ as unknown as D,
	/*
	onError = (_) => console.error(_),
	onSuccess = (_) => console.debug(_),
	*/
}
: QueryOption<T, D> = {})
{
	const key = useRef<string>(); const [state, DO_NOT_USE_THIS] = useState<QueryState<D>>(
	{
		isLoading: true,
		isValidating: true,
	});

	// cherry-pick update
	const deps = useRef(new Set<keyof typeof state>()); const setState = useCallback((_: Partial<typeof state>) =>
	{
		let changes = 0;

		for (const [key, value] of Object.entries(_) as [keyof typeof _, typeof _[keyof typeof _]][])
		{
			// TODO: deep compare
			if (state[key] !== value)
			{
				// @ts-expect-error silent update
				state[key] = value; if (deps.current.has(key)) changes++;
			}
		}
		// re-render
		if (0 < changes)
		{
			DO_NOT_USE_THIS((_) => ({ ..._ }));
		}
	},
	[state]);

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
							// STEP 5. update
							setState(
							{
								isValidating: true,
							});

							// STEP 6. de-dupe requests
							ON_GOING.add(key.current);

							// STEP 7. allocate cache
							WORKER.postMessage({ type: RequestType.ALLOCATE, key: key.current, value: null as T } satisfies Request<T>);

							// STEP 8. fetch
							(function call(retries: number)
							{
								fetcher().then((data) =>
								{
									const signal = extract(data);

									// STEP 9. update
									setState(
									{
										data: signal,
										isLoading: false,
										isValidating: false,
									});

									// STEP 10. allow request
									ON_GOING.delete(key.current!);

									// STEP 11. update cache
									WORKER.postMessage({ type: RequestType.ASSIGN, key: key.current!, value: data } satisfies Request<T>);
								})
								.catch((error) =>
								{
									if (retries < retry)
									{
										// STEP ?. retry
										call(retries + 1);
									}
									else
									{
										// STEP ?. update
										setState(
										{
											error: error,
											isLoading: false,
											isValidating: false,
										});
									}
								});
							})(0);
						}
						break;
					}
					case ResponseType.LOADING:
					{
						// STEP 4. update
						setState(
						{
							isValidating: true,
						});
						break;
					}
					case ResponseType.SUCCESS:
					{
						// STEP 4. compare data
						if (state.data !== response.value)
						{
							const signal = extract(response.value);

							// STEP 5. update
							setState(
							{
								data: signal,
								isLoading: false,
								isValidating: false,
							});
						}
						break;
					}
				}
				// console.debug(response);
			}
		}
		WORKER.addEventListener("message", handle);
		return () => WORKER.removeEventListener("message", handle);
	},
	[fetcher]);

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API */
	useEffect(() =>
	{
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		function handle(event: Event)
		{
			// STEP 2. synchronize
			if (key.current && !document.hidden)
			{
				WORKER.postMessage({ type: RequestType.SYNC, key: key.current, value: null as T } satisfies Request<T>);
			}
		}
		document.addEventListener("visibilitychange", handle);
		return () => document.removeEventListener("visibilitychange", handle);
	},
	[key.current]);

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine */
	useEffect(() =>
	{
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		function handle(event: Event)
		{
			// STEP 2. synchronize
			if (key.current && !document.hidden)
			{
				WORKER.postMessage({ type: RequestType.SYNC, key: key.current, value: null as T } satisfies Request<T>);
			}
		}
		window.addEventListener("online", handle);
		return () => window.removeEventListener("online", handle);
	},
	[key.current]);

	useEffect(() =>
	{
		hash(fetcher.toString() + JSON.stringify(dependencies), "SHA-256").then((sha256) =>
		{
			// STEP 1. hash
			key.current = sha256;

			// STEP 2. synchronize
			WORKER.postMessage({ type: RequestType.SYNC, key: key.current, value: null as T } satisfies Request<T>);
		});
	},
	[fetcher, dependencies]);

	return {
		get data()
		{
			deps.current.add("data"); return state.data;
		},
		get error()
		{
			deps.current.add("error"); return state.error;
		},
		get isLoading()
		{
			deps.current.add("isLoading"); return state.isLoading;
		},
		get isValidating()
		{
			deps.current.add("isValidating"); return state.isValidating;
		},
	} as typeof state;
}

/** @see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest */
async function hash(value: string, algorithm: AlgorithmIdentifier)
{
	// converts an ArrayBuffer to a hex string
	return Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
