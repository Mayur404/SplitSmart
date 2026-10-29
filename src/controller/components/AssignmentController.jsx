/** Item assignment, drag-and-drop, and deterministic natural-language commands. */
export function createAssignmentController(deps) {
  const { $$, currentBill, members, renderAssign, toast, showAmbiguityDialog } = deps;

  function attachDragAndDrop() {
    let draggedMemberId = null;

    $$('.chip[draggable="true"]').forEach((chip) => {
      chip.addEventListener('dragstart', (e) => {
        draggedMemberId = chip.dataset.memberId;
        chip.classList.add('dragging');
        e.dataTransfer.setData('text/plain', draggedMemberId);
        e.dataTransfer.effectAllowed = 'copy';
      });

      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        draggedMemberId = null;
      });
    });

    $$('.assignment-item').forEach((itemCard) => {
      itemCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        itemCard.classList.add('drop-target');
      });

      itemCard.addEventListener('dragleave', () => {
        itemCard.classList.remove('drop-target');
      });

      itemCard.addEventListener('drop', (e) => {
        e.preventDefault();
        itemCard.classList.remove('drop-target');
        const memberId = e.dataTransfer.getData('text/plain') || draggedMemberId;
        const itemId = itemCard.dataset.itemId;

        if (memberId && itemId) {
          toggleItemAssignment(itemId, memberId);
        }
      });
    });
  }

  function toggleItemAssignment(itemId, memberId) {
    const bill = currentBill();
    if (!bill) return;
    const item = bill.items.find((i) => i.id === itemId);
    if (!item) return;

    item.assignments = item.assignments || [];
    if (item.assignments.includes(memberId)) {
      item.assignments = item.assignments.filter((id) => id !== memberId);
    } else {
      item.assignments.push(memberId);
    }
    renderAssign();
  }

  function executeNaturalLanguageCommand(text) {
    if (!text || !text.trim()) return;
    const bill = currentBill();
    if (!bill) return;

    const raw = text.trim();
    const lower = raw.toLowerCase();
    const items = bill.items || [];
    // Pattern 1: Clear all
    if (lower === 'clear all' || lower === 'reset all') {
      items.forEach((i) => (i.assignments = []));
      toast('Cleared all item assignments.');
      renderAssign();
      return;
    }

    // Pattern 2: Clear item X
    const clearMatch = lower.match(/^clear\s+(?:assignment\s+(?:for\s+)?)?(?:item\s+)?(.+)$/);
    if (clearMatch) {
      const targetStr = clearMatch[1].trim();
      const itemNum = parseInt(targetStr, 10);
      const targetItem = !isNaN(itemNum)
        ? items[itemNum - 1]
        : items.find((i) => i.name.toLowerCase().includes(targetStr));
      if (targetItem) {
        targetItem.assignments = [];
        toast(`Cleared assignments for "${targetItem.name}".`);
        renderAssign();
      } else {
        toast(`No item matching "${targetStr}" found.`, true);
      }
      return;
    }

    // Pattern 3: Assign / Put / Split <item> to/on/between <target>
    const assignMatch = lower.match(/^(?:assign|put|split)\s+(.+?)\s+(?:to|on|between)\s+(.+)$/);
    if (!assignMatch) {
      toast(
        'Command not recognized. Example: "Assign naan to everyone" or "Put biryani on Sneha"',
        true,
      );
      return;
    }

    const itemQuery = assignMatch[1].trim();
    const targetQuery = assignMatch[2].trim();

    // Resolve item
    let targetItem = null;
    const itemNum = parseInt(itemQuery.replace(/^item\s+/, ''), 10);
    if (!isNaN(itemNum) && items[itemNum - 1]) {
      targetItem = items[itemNum - 1];
    } else {
      const matchingItems = items.filter((i) => i.name.toLowerCase().includes(itemQuery));
      if (matchingItems.length === 0) {
        toast(`No item found matching "${itemQuery}".`, true);
        return;
      } else if (matchingItems.length > 1) {
        // Ambiguous item match
        showAmbiguityDialog(
          `Multiple items matched "${itemQuery}". Please choose one:`,
          matchingItems.map((i) => ({ label: `${i.name} (Qty ${i.quantity})`, value: i.id })),
          (selectedId) => {
            const itm = items.find((i) => i.id === selectedId);
            if (itm) applyAssignmentToItem(itm, targetQuery);
          },
        );
        return;
      }
      targetItem = matchingItems[0];
    }

    applyAssignmentToItem(targetItem, targetQuery);
  }

  function applyAssignmentToItem(item, targetQuery) {
    const groupMembers = members();
    let assignees = [];

    if (targetQuery === 'everyone' || targetQuery === 'everybody' || targetQuery === 'all') {
      assignees = groupMembers.map((m) => m.id);
    } else if (targetQuery === 'veg' || targetQuery === 'vegetarians') {
      assignees = groupMembers.filter((m) => m.dietaryTag === 'VEG').map((m) => m.id);
    } else if (targetQuery === 'non-veg' || targetQuery === 'nonveg') {
      assignees = groupMembers.filter((m) => m.dietaryTag === 'NON-VEG').map((m) => m.id);
    } else if (targetQuery.includes(' and ')) {
      const names = targetQuery.split(' and ').map((s) => s.trim());
      names.forEach((n) => {
        const match = groupMembers.find((m) => m.name.toLowerCase().includes(n));
        if (match) assignees.push(match.id);
      });
    } else {
      const matches = groupMembers.filter((m) => m.name.toLowerCase().includes(targetQuery));
      if (matches.length === 0) {
        toast(`No group member found matching "${targetQuery}".`, true);
        return;
      } else if (matches.length > 1) {
        showAmbiguityDialog(
          `Multiple members matched "${targetQuery}". Select one:`,
          matches.map((m) => ({ label: m.name, value: m.id })),
          (selectedId) => {
            item.assignments = [selectedId];
            toast(`Assigned ${item.name} to ${matches.find((m) => m.id === selectedId)?.name}.`);
            renderAssign();
          },
        );
        return;
      }
      assignees = [matches[0].id];
    }

    if (assignees.length === 0) {
      toast('No eligible members matched.', true);
      return;
    }

    item.assignments = [...new Set(assignees)];
    toast(
      `Assigned "${item.name}" to ${assignees.map((id) => groupMembers.find((m) => m.id === id)?.name).join(', ')}.`,
    );
    renderAssign();
  }

  return { attachDragAndDrop, toggleItemAssignment, executeNaturalLanguageCommand };
}
