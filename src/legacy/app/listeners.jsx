/** Document-level drag/drop listeners for the receipt uploader rendered by the bill view. */
export function installReceiptDropListeners(onFileDrop) {
  const getDropZone = (target) => target?.closest?.('#receipt-drop-zone');


  const openFilePicker = (zone) => {
    const input = document.getElementById('receipt-upload');
    if (input && zone) input.click();
  };

  const handleZoneClick = (event) => {
    const zone = getDropZone(event.target);
    if (!zone || event.target.closest('label, button, a')) return;
    openFilePicker(zone);
  };

  const handleZoneKeyDown = (event) => {
    const zone = getDropZone(event.target);
    if (!zone || event.target !== zone || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openFilePicker(zone);
  };

  const handleDragOver = (event) => {
    const zone = getDropZone(event.target);
    if (!zone) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('is-dragover');
  };

  const handleDragLeave = (event) => {
    const zone = getDropZone(event.target);
    if (!zone) return;
    if (event.relatedTarget && zone.contains(event.relatedTarget)) return;
    zone.classList.remove('is-dragover');
  };

  const handleDrop = (event) => {
    const zone = getDropZone(event.target);
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    const input = document.getElementById('receipt-upload');
    if (!input) return;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.focus({ preventScroll: true });
    } catch {
      onFileDrop?.(null, new Error('Drag and drop is unavailable in this browser. Use “browse files” instead.'));
    }
  };

  document.addEventListener('click', handleZoneClick);
  document.addEventListener('keydown', handleZoneKeyDown);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragleave', handleDragLeave);
  document.addEventListener('drop', handleDrop);

  return () => {
    document.removeEventListener('click', handleZoneClick);
    document.removeEventListener('keydown', handleZoneKeyDown);
    document.removeEventListener('dragover', handleDragOver);
    document.removeEventListener('dragleave', handleDragLeave);
    document.removeEventListener('drop', handleDrop);
  };
}
