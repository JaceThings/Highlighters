// npm install commands, one per line on the 24px ruled grid. Plain body text,
// font + colour inherited; not interactive. Figma node 2027:77.

export function InstallCommands({ items }: { items: readonly string[] }) {
  return (
    <div className="m-0 flex flex-col items-start text-sm leading-6">
      {items.map((name) => (
        <p key={name} className="m-0">
          npm install {name}
        </p>
      ))}
    </div>
  );
}
