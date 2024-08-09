import fs from "fs";
import path from "path";
import util from "util";

import type { Serve, ServerWebSocket } from "bun";

const folder = path.join(import.meta.dir, util.parseArgs({ args: process.argv, options: { target: { type: "string" } }, allowPositionals: true }).values.target!);

function build()
{
	return Bun.build(
	{
		entrypoints: [path.join(folder, "index.tsx")],
		outdir: path.join(folder),
		minify: true,
	});
}

const [watcher, clients] = [fs.watch(path.join(folder, "index.tsx")), new Set<ServerWebSocket>()];

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

process.on("SIGINT", (event) =>
{
	watcher.close();
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
				return new Response(Bun.file(path.join(folder, "index.html")));
			}
			default:
			{
				return new Response(Bun.file(path.join(folder, url.pathname)));
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
