"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { splitEqually } from "@/lib/money";
import type { GeneratedReceiptItem } from "@/lib/receipt";

export interface Person {
  id: string;
  name: string;
}

interface AssignmentState {
  people: Person[];
  targets: Record<string, string | null>;
  addPerson: () => void;
  updatePerson: (id: string, name: string) => void;
  removePerson: (id: string) => void;
  moveItem: (itemId: string, targetId: string | null) => void;
  reset: (items?: readonly GeneratedReceiptItem[]) => void;
}

export interface PersonTotal {
  personId: string;
  name: string;
  amountPaise: number;
}

export function calculatePersonTotals(
  people: readonly Person[],
  items: readonly GeneratedReceiptItem[],
  targets: Readonly<Record<string, string | null>>,
): {
  people: PersonTotal[];
  commonPaise: number;
  unassignedPaise: number;
  unassignedCount: number;
  assignedPaise: number;
} {
  const direct = new Map(people.map((person) => [person.id, 0]));
  let commonPaise = 0;
  let unassignedPaise = 0;
  let unassignedCount = 0;
  for (const item of items) {
    const target = targets[item.id];
    if (target === "common") commonPaise += item.amountPaise;
    else if (target === null || target === undefined) {
      unassignedPaise += item.amountPaise;
      unassignedCount += 1;
    }
    else if (direct.has(target)) direct.set(target, (direct.get(target) ?? 0) + item.amountPaise);
    else {
      unassignedPaise += item.amountPaise;
      unassignedCount += 1;
    }
  }
  const commonShares = splitEqually(commonPaise, people.length);
  const totals = people.map((person, index) => ({
    personId: person.id,
    name: person.name.trim() || `Person ${index + 1}`,
    amountPaise: (direct.get(person.id) ?? 0) + commonShares[index],
  }));
  return {
    people: totals,
    commonPaise,
    unassignedPaise,
    unassignedCount,
    assignedPaise: items.reduce((sum, item) => {
      const target = targets[item.id];
      return target === "common" || (target !== null && target !== undefined && direct.has(target))
        ? sum + item.amountPaise
        : sum;
    }, 0),
  };
}

export const useAssignmentStore = create<AssignmentState>()(
  persist(
    (set) => ({
      people: [{ id: crypto.randomUUID(), name: "" }],
      targets: {},
      addPerson: () =>
        set((state) => ({ people: [...state.people, { id: crypto.randomUUID(), name: "" }] })),
      updatePerson: (id, name) =>
        set((state) => ({
          people: state.people.map((person) => (person.id === id ? { ...person, name } : person)),
        })),
      removePerson: (id) =>
        set((state) => {
          const people = state.people.filter((person) => person.id !== id);
          const targets = Object.fromEntries(
            Object.entries(state.targets).map(([itemId, target]) => [
              itemId,
              target === id ? null : target,
            ]),
          );
          return {
            people: people.length > 0 ? people : [{ id: crypto.randomUUID(), name: "" }],
            targets,
          };
        }),
      moveItem: (itemId, targetId) =>
        set((state) => ({ targets: { ...state.targets, [itemId]: targetId } })),
      reset: (items = []) =>
        set({
          people: [{ id: crypto.randomUUID(), name: "" }],
          targets: Object.fromEntries(items.map((item) => [item.id, null])),
        }),
    }),
    {
      name: "billsplit-assignment",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ people: state.people, targets: state.targets }),
    },
  ),
);
