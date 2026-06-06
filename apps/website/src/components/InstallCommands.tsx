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
