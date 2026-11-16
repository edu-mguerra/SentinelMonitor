import os
import sys
import tempfile
import pytest

agent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "agent", "linux"))
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

from collector import collect_payload, get_cpu_metrics, get_memory_metrics, get_disk_metrics
from buffer import MetricBuffer

def test_collector_snapshot():
    payload, io, t = collect_payload()
    assert payload["agent_version"] == "1.1.0"
    assert "cpu" in payload
    assert "memory" in payload
    assert "disk" in payload
    assert "network" in payload
    assert "services" in payload

    assert 0.0 <= payload["cpu"]["usage_percent"] <= 100.0
    assert payload["memory"]["total_bytes"] > 0
    assert 0.0 <= payload["memory"]["usage_percent"] <= 100.0

def test_metric_buffer_resilience():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        buffer_file = tmp.name

    try:
        buf = MetricBuffer(file_path=buffer_file, max_items=5)
        assert buf.is_empty()

        buf.push({"idx": 1})
        buf.push({"idx": 2})
        buf.push({"idx": 3})
        assert buf.size() == 3

        items = buf.pop_all()
        assert len(items) == 3
        assert buf.is_empty()

        buf.rollback(items[1:])
        assert buf.size() == 2
        restored = buf.pop_all()
        assert restored[0]["idx"] == 2
        assert restored[1]["idx"] == 3

        for i in range(10):
            buf.push({"val": i})
        assert buf.size() == 5
        final_items = buf.pop_all()
        assert final_items[0]["val"] == 5
        assert final_items[-1]["val"] == 9
    finally:
        if os.path.exists(buffer_file):
            os.remove(buffer_file)
