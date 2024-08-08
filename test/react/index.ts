import fs from "fs";
import path from "path";

function build()
{
	return Bun.build({ entrypoints: [path.join(import.meta.dir, "app", "index.tsx")], outdir: path.join(import.meta.dir, "app"), minify: true });
}

Bun.serve(
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
				return new Response(Bun.file(path.join(import.meta.dir, "app", "index.html")));
			}
			default:
			{
				return new Response(Bun.file(path.join(import.meta.dir, "app", url.pathname)));
			}
		}
	},
	websocket:
	{
		open(ws)
		{
			const watcher = fs.watch(path.join(import.meta.dir, "app", "index.tsx"));

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
	}
});

build();
