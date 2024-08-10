"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const [STORE, TARGET, CHANNEL] = [new Map<string, unknown>(), new EventTarget(), new BroadcastChannel("useSyncState")];

const enum MessageType
{
	SYNC,
	UPDATE,
}

class Message<T>
{
	constructor(public readonly type: MessageType, public readonly key: string, public readonly value: T)
	{
		// TODO: none
	}
}

export default function useSyncState<T>(key: string, fallback: T)
{
	const init = useRef(false); const [data, setData] = useState(STORE.has(key) ? STORE.get(key) as T : fallback);

	const communicate = useCallback((msg: Message<T>) =>
	{
		//
		// STEP 2. match key & value
		//
		if (key === msg.key && data !== msg.value)
		{
			switch (msg.type)
			{
				case MessageType.SYNC:
				{
					//
					// STEP 3. send back data
					//
					if (init.current)
					{
						CHANNEL.postMessage(new Message(MessageType.UPDATE, key, data));
					}
					break;
				}
				case MessageType.UPDATE:
				{
					//
					// STEP 3. reflect msg
					//
					init.current = true; setData(msg.value);
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
			communicate(event.detail as Message<T>);
		}
		// @ts-ignore
		TARGET.addEventListener("msg", handle);
		// @ts-ignore
		return () => TARGET.removeEventListener("msg", handle);
	},
	[communicate]);

	useEffect(() =>
	{
		function handle(event: MessageEvent)
		{
			communicate(event.data as Message<T>);
		}
		CHANNEL.addEventListener("message", handle);
		return () => CHANNEL.removeEventListener("message", handle);
	},
	[communicate]);

	/** @see https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API */
	useEffect(() =>
	{
		function handle(event: Event)
		{
			//
			// STEP 1. synchronize
			//
			CHANNEL.postMessage(new Message<T>(MessageType.SYNC, key, data));
		}
		document.addEventListener("visibilitychange", handle);
		return () => document.removeEventListener("visibilitychange", handle);
	},
	[key, data]);

	useEffect(() =>
	{
		if (!document.hidden)
		{
			//
			// STEP 1. synchronize
			//
			CHANNEL.postMessage(new Message<T>(MessageType.SYNC, key, data));
		}
	},
	[]);

	const setter = useCallback((_: T | ((_: T) => T)) =>
	{
		const signal = _ instanceof Function ? _(data) : _;

		if (signal !== data)
		{
			const msg = new Message(MessageType.UPDATE, key, signal);
			//
			// STEP 3. (waterfall) components -> page -> tabs
			//
			init.current = true; setData(signal); TARGET.dispatchEvent(STORE.set(key, signal) && new CustomEvent("msg", { detail: msg })); CHANNEL.postMessage(msg);
		}
	},
	[key, data]);

	return [data, setter] as [T, typeof setter];
}
