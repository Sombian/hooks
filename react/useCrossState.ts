import { useCallback, useEffect, useState } from "react";

const [CACHE, TARGET, CHANNEL] = [new Map<string, unknown>(), new EventTarget(), new BroadcastChannel("useCrossState")];

const enum Protocol
{
	SYNC,
	UPDATE,
}

class Message<T>
{
	constructor(public readonly type: Protocol, public readonly key: string, public readonly value: T)
	{
		// TODO: none
	}
}

export default function useCrossState<T>(key: string, fallback: T, options: { expire?: number; refresh_on_focus?: boolean; refresh_on_interval?: number; } = {})
{
	const [data, set_data] = useState<T>(CACHE.has(key) ? CACHE.get(key) as T : fallback);

	const protocol = useCallback((msg: Message<T>) =>
	{
		//
		// STEP 2. match key & value
		//
		if (msg.key === key && msg.value !== data)
		{
			switch (msg.type)
			{
				case Protocol.SYNC:
				{
					//
					// STEP 3. send back data
					//
					CHANNEL.postMessage(new Message(Protocol.UPDATE, key, data));
					break;
				}
				case Protocol.UPDATE:
				{
					//
					// STEP 3. reflect msg
					//
					set_data(msg.value);
					break;
				}
			}
		}
	},
	[key, data]);

	useEffect(() =>
	{
		function handle(event: CustomEvent)
		{
			protocol(event.detail as Message<T>);
		}
		// @ts-ignore
		TARGET.addEventListener("msg", handle);
		// @ts-ignore
		return () => TARGET.removeEventListener("msg", handle);
	},
	[protocol]);

	useEffect(() =>
	{
		function handle(event: MessageEvent)
		{
			protocol(event.data as Message<T>);
		}
		CHANNEL.addEventListener("message", handle);
		return () => CHANNEL.removeEventListener("message", handle);
	},
	[protocol]);

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
				CHANNEL.postMessage(new Message<T>(Protocol.SYNC, key, data));
			}
		}
		document.addEventListener("visibilitychange", handle);
		return () => document.removeEventListener("visibilitychange", handle);
	},
	[key, data]);

	useEffect(() =>
	{
		//
		// STEP 1. synchronize
		//
		CHANNEL.postMessage(new Message<T>(Protocol.SYNC, key, data));
	},
	[]);

	const setter = useCallback((_: T | ((_: T) => T)) =>
	{
		const signal = _ instanceof Function ? _(data) : _;

		if (signal !== data)
		{
			const msg = new Message(Protocol.UPDATE, key, signal);
			//
			// STEP 3. (waterfall) component -> page -> channel
			//
			set_data(signal); TARGET.dispatchEvent(CACHE.set(key, signal) && new CustomEvent("msg", { detail: msg })); CHANNEL.postMessage(msg);
		}
	},
	[key, data]);

	return [data, setter] as [T, typeof setter];
}
