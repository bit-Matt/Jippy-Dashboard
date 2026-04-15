// ---------------------------------------------------------------------------
// Binary min-heap priority queue for A* open set
// ---------------------------------------------------------------------------

interface HeapEntry {
  nodeId: string;
  fScore: number;
}

export class MinHeap {
  private heap: HeapEntry[] = [];
  private indexMap = new Map<string, number>();

  get size(): number {
    return this.heap.length;
  }

  insert(nodeId: string, fScore: number): void {
    const existing = this.indexMap.get(nodeId);
    if (existing !== undefined) {
      if (fScore < this.heap[existing].fScore) {
        this.heap[existing].fScore = fScore;
        this.bubbleUp(existing);
      }
      return;
    }

    this.heap.push({ nodeId, fScore });
    const idx = this.heap.length - 1;
    this.indexMap.set(nodeId, idx);
    this.bubbleUp(idx);
  }

  extractMin(): { nodeId: string; fScore: number } | null {
    if (this.heap.length === 0) return null;

    const min = this.heap[0];
    this.indexMap.delete(min.nodeId);

    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.indexMap.set(last.nodeId, 0);
      this.sinkDown(0);
    }

    return min;
  }

  has(nodeId: string): boolean {
    return this.indexMap.has(nodeId);
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.heap[idx].fScore >= this.heap[parent].fScore) break;
      this.swap(idx, parent);
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const length = this.heap.length;
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      let smallest = idx;

      if (left < length && this.heap[left].fScore < this.heap[smallest].fScore) {
        smallest = left;
      }
      if (right < length && this.heap[right].fScore < this.heap[smallest].fScore) {
        smallest = right;
      }

      if (smallest === idx) break;
      this.swap(idx, smallest);
      idx = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const a = this.heap[i];
    const b = this.heap[j];
    this.heap[i] = b;
    this.heap[j] = a;
    this.indexMap.set(a.nodeId, j);
    this.indexMap.set(b.nodeId, i);
  }
}
