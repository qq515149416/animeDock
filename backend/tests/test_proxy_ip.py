"""仅受信任的反向代理可以提供真实客户端 IP。"""
from ipaddress import ip_address
from types import SimpleNamespace

import httpx
import pytest
from starlette.requests import Request

from app import deps
from app.main import app


def make_request(peer: str, values: list[str]) -> Request:
    """构建包含原始重复头的 ASGI 请求。"""
    return Request({'type': 'http', 'method': 'GET', 'path': '/api/anime/search', 'headers': [(b'x-fanjuwu-client-ip', value.encode()) for value in values], 'client': (peer, 1234), 'scheme': 'http', 'server': ('localhost', 8000), 'query_string': b''})


def test_untrusted_direct_client_cannot_spoof_ip(monkeypatch) -> None:
    monkeypatch.setattr(deps, 'get_settings', lambda: SimpleNamespace(trusted_proxy_cidrs=['172.16.0.0/12']))
    assert deps.resolve_client_ip(make_request('203.0.113.9', ['198.51.100.2'])) == '203.0.113.9'


@pytest.mark.parametrize('values', [[], ['bad-ip'], ['198.51.100.2, 198.51.100.3'], ['198.51.100.2', '198.51.100.3'], [''], ['198.51.100.2:1234']])
def test_trusted_proxy_malformed_or_multiple_values_use_peer(monkeypatch, values) -> None:
    monkeypatch.setattr(deps, 'get_settings', lambda: SimpleNamespace(trusted_proxy_cidrs=['172.16.0.0/12']))
    assert deps.resolve_client_ip(make_request('172.20.0.3', values)) == '172.20.0.3'


def test_trusted_proxy_uses_single_valid_ipv6(monkeypatch) -> None:
    monkeypatch.setattr(deps, 'get_settings', lambda: SimpleNamespace(trusted_proxy_cidrs=['172.16.0.0/12']))
    value = deps.resolve_client_ip(make_request('172.20.0.3', ['2001:db8::1234']))
    assert ip_address(value) == ip_address('2001:db8::1234')


def test_empty_trust_list_ignores_forwarded_header(monkeypatch) -> None:
    monkeypatch.setattr(deps, 'get_settings', lambda: SimpleNamespace(trusted_proxy_cidrs=[]))
    assert deps.resolve_client_ip(make_request('172.20.0.3', ['198.51.100.2'])) == '172.20.0.3'


@pytest.mark.asyncio
async def test_proxy_clients_receive_separate_middleware_buckets(monkeypatch) -> None:
    from app import main
    buckets = []

    async def record_limit(key: str, limit: int) -> None:
        buckets.append(key)

    monkeypatch.setattr(deps, 'get_settings', lambda: SimpleNamespace(trusted_proxy_cidrs=['172.16.0.0/12']))
    monkeypatch.setattr(main, 'check_rate_limit', record_limit)
    transport = httpx.ASGITransport(app=app, client=('172.20.0.3', 1234))
    async with httpx.AsyncClient(transport=transport, base_url='http://local') as client:
        for value in ['198.51.100.2', '198.51.100.3']:
            response = await client.get('/api/unknown', headers={'x-fanjuwu-client-ip': value})
            assert response.status_code == 404
    assert buckets == ['ip:198.51.100.2', 'ip:198.51.100.3']


def test_raw_forwarded_for_is_never_used(monkeypatch) -> None:
    monkeypatch.setattr(deps, 'get_settings', lambda: SimpleNamespace(trusted_proxy_cidrs=['172.16.0.0/12']))
    request = make_request('172.20.0.3', [])
    request.scope['headers'].append((b'x-forwarded-for', b'198.51.100.2'))
    assert deps.resolve_client_ip(request) == '172.20.0.3'


def test_ipv4_mapped_proxy_and_client_are_normalized(monkeypatch) -> None:
    monkeypatch.setattr(deps, 'get_settings', lambda: SimpleNamespace(trusted_proxy_cidrs=['172.16.0.0/12']))
    assert deps.resolve_client_ip(make_request('::ffff:172.20.0.3', ['::ffff:198.51.100.2'])) == '198.51.100.2'
