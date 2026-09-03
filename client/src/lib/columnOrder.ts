export function moveItemBefore<T extends string>(items: T[], source: T, target: T): T[] {
  if (source === target) return items;
  const sourceIndex = items.indexOf(source);
  const targetIndex = items.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0) return items;

  const next = [...items];
  next.splice(sourceIndex, 1);
  next.splice(next.indexOf(target), 0, source);
  return next;
}
