import { useEffect, useState } from "react";

const ON_GOING = new Set<string>();

const enum RequestType
{
	SYNC,
	ASSIGN,
	ALLOCATE,
}

interface Request<T>
{
	readonly type: RequestType;
	readonly path: string;
	readonly data?: T;
}

const enum ResponseType
{
	EMPTY,
	LOADING,
	SUCCESS,
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
				const request: Request<unknown> = event.data;

				switch (request.type)
				{
					case RequestType.SYNC:
					{
						if (!storage.has(request.path))
						{
							port.postMessage({ type: ResponseType.EMPTY, path: request.path, data: null } satisfies Response<typeof request["data"]>);
						}
						else
						{
							const cache = storage.get(request.path)!;

							if (cache === "init")
							{
								port.postMessage({ type: ResponseType.LOADING, path: request.path, data: null } satisfies Response<typeof request["data"]>);
							}
							else
							{
								port.postMessage({ type: ResponseType.SUCCESS, path: request.path, data: cache.value } satisfies Response<typeof request["data"]>);
							}
						}
						break;
					}
					case RequestType.ASSIGN:
					{
						storage.set(request.path, { since: Date.now(), value: request.data });

						for (const port of ports)
						{
							port.postMessage({ type: ResponseType.SUCCESS, path: request.path, data: request.data } satisfies Response<typeof request["data"]>);
						}
						break;
					}
					case RequestType.ALLOCATE:
					{
						storage.set(request.path, "init");

						for (const port of ports)
						{
							port.postMessage({ type: ResponseType.LOADING, path: request.path, data: request.data } satisfies Response<typeof request["data"]>);
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

export default function useQuery<T>(key: string, fetcher: () => Promise<T>, options: { retry?: number; expire?: number; refresh_on_focus?: boolean; refresh_on_interval?: number; refresh_on_reconnect?: boolean; } = {})
{
	const [data, set_data] = useState<T>();

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker */
	useEffect(() =>
	{
		function handle(event: MessageEvent)
		{
			const response: Response<T> = event.data;
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
						if (!ON_GOING.has(key))
						{
							//
							// STEP 4. prevent duplication
							//
							ON_GOING.add(key);
							//
							// STEP 5. allocate cache
							//
							WORKER.port.postMessage({ type: RequestType.ALLOCATE, path: key } satisfies Request<T>);
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
								ON_GOING.delete(key);
								//
								// STEP 9. update cache
								//
								WORKER.port.postMessage({ type: RequestType.ASSIGN, path: key, data: data } satisfies Request<T>);
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
				WORKER.port.postMessage({ type: RequestType.SYNC, path: key } satisfies Request<T>);
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
			WORKER.port.postMessage({ type: RequestType.SYNC, path: key } satisfies Request<T>);
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
			WORKER.port.postMessage({ type: RequestType.SYNC, path: key } satisfies Request<T>);
		}
	},
	[]);

	return { data };
}
