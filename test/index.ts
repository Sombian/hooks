import fs from "fs";
import path from "path";
import util from "util";

import type { Serve, ServerWebSocket } from "bun";

const folder = util.parseArgs({ args: process.argv, options: { target: { type: "string" } }, allowPositionals: true }).values.target!;

function build()
{
	return Bun.build(
	{
		entrypoints: [path.join(import.meta.dir, folder, "index.tsx")],
		outdir: path.join(import.meta.dir, folder),
		minify: true,
	});
}

const [watchers, clients] = [new Set<fs.FSWatcher>, new Set<ServerWebSocket>()];

watchers.add(fs.watch(path.join(import.meta.dir, folder, "index.tsx"), { recursive: true }));
watchers.add(fs.watch(path.join(import.meta.dir, "..", "src", folder), { recursive: true }));

for (const watcher of watchers)
{
	watcher.addListener("change", (event) =>
	{
		build().then(() =>
		{
			for (const client of clients)
			{
				client.send(":3");
			}
		});
	});
}

process.on("SIGINT", (event) =>
{
	for (const watcher of watchers)
	{
		watcher.close();
	}
	process.exit(0);
});

build();

export default
{
	fetch(request, server)
	{
		const url = new URL(request.url);

		if (server.upgrade(request))
		{
			return;
		}

		switch (url.pathname)
		{
			case "/":
			{
				return new Response(Bun.file(path.join(import.meta.dir, folder, "index.html")));
			}
			default:
			{
				return new Response(Bun.file(path.join(import.meta.dir, folder, url.pathname)));
			}
		}
	},
	websocket:
	{
		open(ws)
		{
			clients.add(ws);
		},
		close(ws)
		{
			clients.delete(ws);
		},
		message(ws, msg)
		{
			// TODO: none
		},
	},
} satisfies Serve;
