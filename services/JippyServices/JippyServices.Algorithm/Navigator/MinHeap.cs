namespace JippyServices.Algorithm.Navigator;

// -------------------------------------------------------------------------
// Binary min-heap priority queue for the A* open set.
// Ported from lib/routing/min-heap.ts
// -------------------------------------------------------------------------

public sealed class MinHeap
{
    private readonly List<(string NodeId, double FScore)> _heap = [];
    private readonly Dictionary<string, int> _indexMap = new();

    public int Size => _heap.Count;

    /// <summary>
    /// Insert a node with the given f-score. If the node already exists
    /// and the new f-score is lower, update it in place.
    /// </summary>
    public void Insert(string nodeId, double fScore)
    {
        if (_indexMap.TryGetValue(nodeId, out var existing))
        {
            if (fScore < _heap[existing].FScore)
            {
                _heap[existing] = (nodeId, fScore);
                BubbleUp(existing);
            }
            return;
        }

        _heap.Add((nodeId, fScore));
        var idx = _heap.Count - 1;
        _indexMap[nodeId] = idx;
        BubbleUp(idx);
    }

    /// <summary>
    /// Remove and return the node with the smallest f-score.
    /// Returns null if the heap is empty.
    /// </summary>
    public (string NodeId, double FScore)? ExtractMin()
    {
        if (_heap.Count == 0) return null;

        var min = _heap[0];
        _indexMap.Remove(min.NodeId);

        var last = _heap[^1];
        _heap.RemoveAt(_heap.Count - 1);

        if (_heap.Count > 0)
        {
            _heap[0] = last;
            _indexMap[last.NodeId] = 0;
            SinkDown(0);
        }

        return min;
    }

    public bool Has(string nodeId) => _indexMap.ContainsKey(nodeId);

    private void BubbleUp(int idx)
    {
        while (idx > 0)
        {
            var parent = (idx - 1) >> 1;
            if (_heap[idx].FScore >= _heap[parent].FScore) break;
            Swap(idx, parent);
            idx = parent;
        }
    }

    private void SinkDown(int idx)
    {
        var length = _heap.Count;
        while (true)
        {
            var left = 2 * idx + 1;
            var right = 2 * idx + 2;
            var smallest = idx;

            if (left < length && _heap[left].FScore < _heap[smallest].FScore)
                smallest = left;
            if (right < length && _heap[right].FScore < _heap[smallest].FScore)
                smallest = right;

            if (smallest == idx) break;
            Swap(idx, smallest);
            idx = smallest;
        }
    }

    private void Swap(int i, int j)
    {
        (_heap[i], _heap[j]) = (_heap[j], _heap[i]);
        _indexMap[_heap[i].NodeId] = i;
        _indexMap[_heap[j].NodeId] = j;
    }
}
