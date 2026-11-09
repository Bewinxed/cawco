/**
 * A task card's shared-element key (platform/motion/share): TaskCard
 * carries it, and a move the board makes departs the card under it, so the
 * card flies to its new column.
 */
export const taskShare = (id: string): string => `task:${id}`;
