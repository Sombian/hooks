import { useEffect, useState } from "react";

const CONCURRENT = new Set<string>();

const enum RequestType
{
	SYNC = "sync",
	ASSIGN = "assign",
	ALLOCATE = "allocate",
}

interface Request<T>
{
	readonly type: RequestType;
	readonly path: string;
	readonly data?: T;
}

const enum ResponseType
{
	EMPTY = "empty",
	LOADING = "loading",
	SUCCESS = "success",
}

interface Response<T>
{
	readonly type: ResponseType;
	readonly path: string;
	readonly data: T;
}

/** @see https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem */
const WORKER = new SharedWorker("data:text/javascript;base64," + btoa(String.fromCodePoint(...new TextEncoder().encode(
	"(" +
	// start
	function ()
	{
		const ports: MessagePort[] = []; const storage = new Map<string, { since: number; value: unknown; } | "init">();

		// @ts-ignore
		self.addEventListener("connect", (event: MessageEvent) =>
		{
			const port = event.ports[0];

			ports.push(port);

			port.addEventListener("message", (event) =>
			{
				const request = event.data as Request<unknown>;

				switch (request.type)
				{
					case RequestType.SYNC:
					{
						if (!storage.has(request.path))
						{
							port.postMessage({ type: ResponseType.EMPTY, path: request.path, data: null } as Response<unknown>);
						}
						else
						{
							const cache = storage.get(request.path)!;

							if (cache === "init")
							{
								port.postMessage({ type: ResponseType.LOADING, path: request.path, data: null } as Response<unknown>);
							}
							else
							{
								port.postMessage({ type: ResponseType.SUCCESS, path: request.path, data: cache.value } as Response<unknown>);
							}
						}
						break;
					}
					case RequestType.ASSIGN:
					{
						storage.set(request.path, { since: Date.now(), value: request.data });

						for (const port of ports)
						{
							port.postMessage({ type: ResponseType.SUCCESS, path: request.path, data: request.data } as Response<unknown>);
						}
						break;
					}
					case RequestType.ALLOCATE:
					{
						storage.set(request.path, "init");

						for (const port of ports)
						{
							port.postMessage({ type: ResponseType.LOADING, path: request.path, data: request.data } as Response<unknown>);
						}
						break;
					}
				}
			});
			// ..!
			port.start();
		});
	}
	.toString()
	// close
	+ ")()",
))));
// ..!
WORKER.port.start();

export default function useQuery<T>(key: string, fetcher: () => Promise<T>, options: { retry?: number; lifespan?: number; refresh_on_focus?: boolean; refresh_on_interval?: number; refresh_on_reconnect?: boolean; } = {})
{
	const [data, set_data] = useState<T>();

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker */
	useEffect(() =>
	{
		function handle(event: MessageEvent)
		{
			const response = event.data as Response<T>;
			//
			// STEP 2. match key & value
			//
			if (response.path === key)
			{
				switch (response.type)
				{
					case ResponseType.EMPTY:
					{
						//
						// STEP 3. dedupe
						//
						if (!CONCURRENT.has(key))
						{
							//
							// STEP 4. prevent duplication
							//
							CONCURRENT.add(key);
							//
							// STEP 5. allocate cache
							//
							WORKER.port.postMessage({ type: RequestType.ALLOCATE, path: key } as Request<T>);
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
								CONCURRENT.delete(key);
								//
								// STEP 9. update cache
								//
								WORKER.port.postMessage({ type: RequestType.ASSIGN, path: key, data: data } as Request<T>);
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
			if (!document.hidden)
			{
				//
				// STEP 1. synchronize
				//
				WORKER.port.postMessage({ type: RequestType.SYNC, path: key } as Request<T>);
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
			WORKER.port.postMessage({ type: RequestType.SYNC, path: key } as Request<T>);
		}
		window.addEventListener("online", handle);
		return () => window.removeEventListener("online", handle);
	},
	[key]);

	useEffect(() =>
	{
		//
		// STEP 1. synchronize
		//
		if (navigator.onLine)
		{
			WORKER.port.postMessage({ type: RequestType.SYNC, path: key, data: null } as Request<T>);
		}
	},
	[]);

	return { data } as { data: T; };
}
