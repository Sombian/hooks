import fs from "fs";
import path from "path";
import util from "util";

import type { Serve } from "bun";

const folder = (() =>
{
	const { values } = util.parseArgs({ args: Bun.argv, options: { target: { type: "string" } }, allowPositionals: true });

	if (!values.target) throw new Error();
	
	return path.join(import.meta.dir, values.target);
})
();

function build()
{
	return Bun.build({ entrypoints: [path.join(folder, "index.tsx")], outdir: path.join(folder), minify: true });
}

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
			const watcher = fs.watch(path.join(folder, "index.tsx"));

			watcher.addListener("change", (event) =>
			{
				build().then(() => ws.send(":3"));
			});

			process.on("SIGINT", (event) =>
			{
				watcher.close();
				process.exit(0);
			});
		},
		message(ws, msg)
		{
			// TODO: none
		}
	},
} satisfies Serve;
