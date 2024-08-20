export default function is_equal(a: unknown, b: unknown, refs = new WeakSet())
{
	if (Object.is(a, b)) return true;
	if (!object(a) || !object(b)) return false;
	if (refs.has(a!) || refs.has(b!)) return false;

	const keys_1 = Object.keys(a as never);
	const keys_2 = Object.keys(b as never);

	if (keys_1.length !== keys_2.length) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;

	refs.add(a!);
	refs.add(b!);

	for (const key of keys_1)
	{
		// @ts-expect-error stfu
		if (!is_equal(a[key], b[key], refs))
		{
			return false;
		}
	}
	return true;
}

function object(value: unknown)
{
	if (value === null) return false;
	if (typeof value === "object") return true;
	if (typeof value === "function") return true;

	return false; // return value === Object(value);
}
