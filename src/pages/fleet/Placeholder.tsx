import { Eyebrow } from "../../design/components";

/**
 * Stand-in for a Fleet screen that a later task fills in. It keeps the shell
 * navigable (and the routes real) without pretending to show data.
 */
export function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>WarpHold Fleet</Eyebrow>
      <h1 className="font-display m-0 text-[30px] leading-none font-extrabold tracking-[-0.02em]">{title}</h1>
      <p className="text-muted m-0">{note ?? "This screen is not built yet."}</p>
    </div>
  );
}
