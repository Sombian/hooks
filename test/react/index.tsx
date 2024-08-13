import React from "react";
import ReactDOM from "react-dom/client";

import useQuery from "@/react/useQuery";
import useSyncState from "@/react/useSyncState";

function App()
{
	return (
		<main>
			<React.Suspense fallback="...">
				<UseQuery />
			</React.Suspense>
			<hr/>
			<React.Suspense fallback="...">
				<UseSyncState />
			</React.Suspense>
		</main>
	);
}

function fetcher()
{
	console.debug("%cinvoke", "color:#FF5500");
	return new Promise<string>((resolve) => setTimeout(() => { console.debug("%cresolve", "color:#FF5500"); resolve(":3"); }, 1000 * 1.5));
}

function UseQuery()
{
	const { data: foo } = useQuery(fetcher, [], { suspense: true });
	const { data: bar } = useQuery(fetcher, [], { suspense: true });

	return (
		<>
			<table border={1}>
				<thead>
					<th>foo</th>
					<th>bar</th>
				</thead>
				<tbody>
					<tr>
						<td>{foo}</td>
						<td>{bar}</td>
					</tr>
				</tbody>
			</table>
		</>
	);
}

function UseSyncState()
{
	const [foo, setFoo] = useSyncState("test", 0);
	const [bar, setBar] = useSyncState("test", 5);

	return (
		<>
			<table border={1}>
				<thead>
					<th>foo</th>
					<th>bar</th>
				</thead>
				<tbody>
					<tr>
						<td>{foo}</td>
						<td>{bar}</td>
					</tr>
				</tbody>
			</table>
			<div>
				<button onClick={() => setFoo((_) => _ + 1)}>
					foo::increase
				</button>
				<button onClick={() => setFoo((_) => _ - 1)}>
					foo::decrease
				</button>
			</div>
			<div>
				<button onClick={() => setBar((_) => _ + 1)}>
					bar::increase
				</button>
				<button onClick={() => setBar((_) => _ - 1)}>
					bar::decrease
				</button>
			</div>
		</>
	);
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
