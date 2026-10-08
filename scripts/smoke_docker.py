"""Check only the fictitious local Hardhat demonstration launched by Compose."""
import json
from urllib.request import Request, urlopen

BASE = 'http://127.0.0.1:8080'
def request(path, payload=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = None if payload is None else json.dumps(payload).encode()
    with urlopen(Request(BASE + path, data=data, headers=headers), timeout=20) as r:
        return json.load(r)

with urlopen(BASE, timeout=20) as r:
    assert r.status == 200 and b'<div id="root"' in r.read()
health = request('/health')
assert health['status'] == 'ok'
assert health['reimbursementConfigured'] and health['drugTraceabilityConfigured']
contracts = request('/api/contracts')
assert contracts['chainId'] == '31337', 'This test is restricted to the local demo chain'
assert contracts['reimbursementContract'] and contracts['drugTraceabilityContract']
token = request('/api/auth/demo', {})['token']
request('/api/reimbursement/fund', {'amountWei': '1000000000000000000'}, token)
assert request('/api/reimbursement/balance')['balanceWei'] == '1000000000000000000'
assert request('/api/reimbursement/claims/count')['count'] == '0'
print('Frontend, API proxy, deployed contract reads and funded local signer: passed.')
