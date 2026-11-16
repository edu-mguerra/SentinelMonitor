import os
import json
import logging
from typing import List, Dict, Any

logger = logging.getLogger("sentinel.buffer")

class MetricBuffer:
    """
    Fila local resiliente com persistência em disco.
    Garante que quedas temporárias de rede na VPS não causem perda de métricas.
    """

    def __init__(self, file_path: str = "/tmp/sentinel-agent-buffer.json", max_items: int = 120):
        self.file_path = file_path
        self.max_items = max_items
        self._memory_queue: List[Dict[str, Any]] = []
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self._memory_queue = data[-self.max_items:]
            except Exception as e:
                logger.warning(f"Não foi possível ler o arquivo de buffer em disco: {e}")
                self._memory_queue = []

    def _save_to_disk(self) -> None:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(self.file_path)), exist_ok=True)
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(self._memory_queue, f)
        except Exception as e:
            logger.error(f"Erro ao salvar buffer em disco: {e}")

    def push(self, item: Dict[str, Any]) -> None:
        """Adiciona um payload ao buffer. Descarta os mais antigos se atingir o limite."""
        self._memory_queue.append(item)
        if len(self._memory_queue) > self.max_items:
            self._memory_queue.pop(0)
        self._save_to_disk()

    def pop_all(self) -> List[Dict[str, Any]]:
        """Retorna e limpa todos os itens da fila para tentativa de envio."""
        items = list(self._memory_queue)
        self._memory_queue.clear()
        self._save_to_disk()
        return items

    def rollback(self, items: List[Dict[str, Any]]) -> None:
        """Recoloca os itens na frente da fila caso a tentativa de envio falhe."""
        self._memory_queue = (items + self._memory_queue)[-self.max_items:]
        self._save_to_disk()

    def is_empty(self) -> bool:
        return len(self._memory_queue) == 0

    def size(self) -> int:
        return len(self._memory_queue)
