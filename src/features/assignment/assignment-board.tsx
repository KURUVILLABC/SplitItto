"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { GeneratedReceiptItem } from "@/lib/receipt";
import { formatRupees } from "@/lib/money";
import {
  calculatePersonTotals,
  type Person,
} from "@/features/assignment/assignment-store";

interface AssignmentBoardProps {
  items: readonly GeneratedReceiptItem[];
  people: readonly Person[];
  targets: Readonly<Record<string, string | null>>;
  onMove: (itemId: string, targetId: string | null) => void;
  onAddPerson: () => void;
  onUpdatePerson: (id: string, name: string) => void;
  onRemovePerson: (id: string) => void;
}

function ItemTag({
  item,
  people,
  targets,
  onMove,
}: {
  item: GeneratedReceiptItem;
  people: readonly Person[];
  targets: Readonly<Record<string, string | null>>;
  onMove: (itemId: string, targetId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `item:${item.id}`,
    data: { itemId: item.id },
  });
  return (
    <div className="item-tag-shell">
      <motion.button
        ref={setNodeRef}
        type="button"
        style={{
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.45 : 1,
        }}
        className="item-tag"
        aria-label={`Move ${item.label}, ${formatRupees(item.amountPaise)}`}
        {...listeners}
        {...attributes}
        whileTap={{ scale: 0.97 }}
      >
        <span className="item-dot" />
        <span className="tag-name">{item.label}</span>
        <strong>{formatRupees(item.amountPaise)}</strong>
      </motion.button>
      <select
        className="item-assignment-select"
        aria-label={`Assign ${item.label}`}
        value={targets[item.id] ?? ""}
        onChange={(event) => onMove(item.id, event.target.value || null)}
      >
        <option value="">Unassigned</option>
        <option value="common">Common</option>
        {people.map((person, index) => (
          <option value={person.id} key={person.id}>
            {person.name.trim() || `Person ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function DropZone({
  id,
  children,
  className = "",
  emptyText,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  emptyText: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`drop-zone ${isOver ? "drop-zone-active" : ""} ${className}`}
      aria-label={emptyText}
    >
      {children}
    </div>
  );
}

export function AssignmentBoard({
  items,
  people,
  targets,
  onMove,
  onAddPerson,
  onUpdatePerson,
  onRemovePerson,
}: AssignmentBoardProps) {
  const [activeItem, setActiveItem] = useState<GeneratedReceiptItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
  };
  const totals = calculatePersonTotals(people, items, targets);
  const unassigned = items.filter((item) => !targets[item.id]);
  const common = items.filter((item) => targets[item.id] === "common");

  function handleDragStart(event: DragStartEvent) {
    const itemId = event.active.data.current?.itemId;
    setActiveItem(items.find((item) => item.id === itemId) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const itemId = event.active.data.current?.itemId;
    const overId = event.over?.id;
    if (typeof itemId !== "string" || typeof overId !== "string") return;
    if (overId === "zone:items") onMove(itemId, null);
    if (overId === "zone:common") onMove(itemId, "common");
    if (overId.startsWith("zone:person:")) onMove(itemId, overId.slice("zone:person:".length));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveItem(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="assignment-grid">
        <section className="board-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">01 / YOUR RECEIPT</span>
              <h2>Items</h2>
            </div>
            <span className="count-pill">{unassigned.length} left</span>
          </div>
          <DropZone id="zone:items" emptyText="Unassigned receipt items">
            {unassigned.length > 0 ? (
              unassigned.map((item) => <ItemTag key={item.id} item={item} people={people} targets={targets} onMove={onMove} />)
            ) : (
              <div className="drop-empty">
                <span className="empty-check">✓</span>
                <span>Everything has a place</span>
                <small>Drop an item here to unassign it</small>
              </div>
            )}
          </DropZone>
          <div className="panel-footnote">{items.length} item{items.length === 1 ? "" : "s"} · drag to assign</div>
        </section>

        <section className="board-panel common-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">02 / FOR EVERYONE</span>
              <h2>Common</h2>
            </div>
            <span className="common-icon">↗</span>
          </div>
          <p className="panel-description">Shared plates, service charge, or anything for the table.</p>
          <DropZone id="zone:common" emptyText="Shared items drop zone" className="common-drop">
            {common.length > 0 ? (
              common.map((item) => <ItemTag key={item.id} item={item} people={people} targets={targets} onMove={onMove} />)
            ) : (
              <div className="drop-empty">
                <span className="common-empty-icon">＋</span>
                <span>Drop shared items here</span>
              </div>
            )}
          </DropZone>
          <div className="common-total">
            <span>Shared items total</span>
            <strong>{formatRupees(totals.commonPaise)}</strong>
          </div>
          <p className="share-note">Split equally across all {people.length} people</p>
        </section>

        <section className="board-panel people-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">03 / THE GROUP</span>
              <h2>People</h2>
            </div>
            <span className="count-pill">{people.length} member{people.length === 1 ? "" : "s"}</span>
          </div>
          <div className="people-table" role="table" aria-label="People and assigned items">
            <div className="people-table-head" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Assigned items</span>
              <span role="columnheader">Total</span>
              <span aria-hidden="true" />
            </div>
            {people.map((person, index) => {
              const personItems = items.filter((item) => targets[item.id] === person.id);
              const personTotal = totals.people.find((total) => total.personId === person.id);
              return (
                <motion.div
                  layout
                  key={person.id}
                  className="person-row"
                  role="row"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <label className="person-name-cell" role="cell">
                    <span className="person-avatar">{(person.name.trim()[0] || `${index + 1}`).toUpperCase()}</span>
                    <input
                      aria-label={`Person ${index + 1} name`}
                      value={person.name}
                      maxLength={60}
                      onChange={(event) => onUpdatePerson(person.id, event.target.value)}
                      placeholder={`Person ${index + 1}`}
                    />
                  </label>
                  <div className="person-items-cell" role="cell">
                    <DropZone
                      id={`zone:person:${person.id}`}
                      emptyText={`Drop items for ${person.name || `person ${index + 1}`}`}
                      className="person-drop"
                    >
                      {personItems.length > 0 ? (
                        personItems.map((item) => <ItemTag key={item.id} item={item} people={people} targets={targets} onMove={onMove} />)
                      ) : (
                        <span className="person-drop-placeholder">Drop items here</span>
                      )}
                    </DropZone>
                  </div>
                  <strong className="person-amount" role="cell">
                    {formatRupees(personTotal?.amountPaise ?? 0)}
                  </strong>
                  <div className="person-actions" role="cell">
                    {people.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${person.name || `person ${index + 1}`}`}
                        className="icon-button remove-person"
                        onClick={() => onRemovePerson(person.id)}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <button type="button" className="add-person-button" onClick={onAddPerson}>
            <Plus size={16} /> Add person
          </button>
          <p className="people-footnote">Items in Common are shared equally between everyone.</p>
        </section>
      </div>
      <DragOverlay>
        {activeItem ? (
          <motion.div
            className="item-tag item-tag-overlay"
            initial={{ scale: 0.92, rotate: -2 }}
            animate={{ scale: 1.04, rotate: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
          >
            <span className="item-dot" />
            <span className="tag-name">{activeItem.label}</span>
            <strong>{formatRupees(activeItem.amountPaise)}</strong>
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
