"""
Availability Checker - PM Agent Phase 4

Checks solver availability by reading rate limits from Redis.
Compatible with angrav's rate limit storage format.

Redis key pattern: angrav:ratelimit:current:{model}:{account}
"""

import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


# Configuration
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
KEY_PREFIX = 'angrav:ratelimit'


@dataclass
class RateLimitRecord:
    """Rate limit record (matches angrav TypeScript format)"""
    model: str
    account: str
    session_id: str
    is_limited: bool
    available_at: str  # ISO timestamp
    available_at_unix: int  # Unix timestamp ms
    detected_at: str
    source: str


@dataclass
class SolverAvailability:
    """Availability status for a solver"""
    solver: str
    available: bool
    available_at: Optional[datetime] = None
    reason: Optional[str] = None


# Solver to model mapping
SOLVER_MODELS = {
    'angrav': ['gemini-2.0-flash-thinking-exp', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'],
    'jules': None,  # Jules doesn't use rate-limited models
    'gemini': ['gemini-1.5-pro', 'gemini-1.5-flash'],
    'perplexity': None,  # No subscription
    'local-slm': None,  # Local, no rate limits
}

# Default account (can be overridden)
DEFAULT_ACCOUNT = os.environ.get('ANGRAV_ACCOUNT', 'default')


def get_redis_client():
    """Get Redis client if available"""
    if not REDIS_AVAILABLE:
        return None
    
    try:
        client = redis.from_url(REDIS_URL, decode_responses=True)
        client.ping()  # Test connection
        return client
    except Exception as e:
        print(f"⚠️ Redis unavailable: {e}")
        return None


def get_current_rate_limit(
    model: str,
    account: str = DEFAULT_ACCOUNT,
    client=None
) -> Optional[RateLimitRecord]:
    """
    Get current rate limit status for a model.
    
    Reads from angrav's Redis storage.
    """
    if client is None:
        client = get_redis_client()
    
    if client is None:
        return None
    
    # Normalize model name (matches angrav's normalization)
    normalized_model = model.lower().replace(' ', '-')
    normalized_model = ''.join(c for c in normalized_model if c.isalnum() or c == '-')
    normalized_account = account.lower()
    normalized_account = ''.join(c for c in normalized_account if c.isalnum() or c in '@.-')
    
    key = f"{KEY_PREFIX}:current:{normalized_model}:{normalized_account}"
    
    try:
        data = client.get(key)
        if data:
            record = json.loads(data)
            return RateLimitRecord(
                model=record.get('model', model),
                account=record.get('account', account),
                session_id=record.get('sessionId', ''),
                is_limited=record.get('isLimited', False),
                available_at=record.get('availableAt', ''),
                available_at_unix=record.get('availableAtUnix', 0),
                detected_at=record.get('detectedAt', ''),
                source=record.get('source', ''),
            )
    except Exception as e:
        print(f"⚠️ Error reading rate limit for {model}: {e}")
    
    return None


def check_solver_availability(
    solver: str,
    account: str = DEFAULT_ACCOUNT
) -> SolverAvailability:
    """
    Check if a solver is currently available.
    
    For solvers with models, checks rate limits.
    For solvers without models, always available.
    """
    # Solvers without rate-limited models
    if solver not in SOLVER_MODELS or SOLVER_MODELS[solver] is None:
        # Check for perplexity (no subscription)
        if solver == 'perplexity':
            return SolverAvailability(
                solver=solver,
                available=False,
                reason='No Perplexity subscription',
            )
        
        # Jules, local-slm are always available
        return SolverAvailability(
            solver=solver,
            available=True,
            reason='No rate limits',
        )
    
    # Check rate limits for all models
    models = SOLVER_MODELS[solver]
    client = get_redis_client()
    
    if client is None:
        # Can't check Redis, assume available
        return SolverAvailability(
            solver=solver,
            available=True,
            reason='Redis unavailable, assuming available',
        )
    
    now_ms = int(datetime.now().timestamp() * 1000)
    earliest_available = None
    all_limited = True
    
    for model in models:
        limit = get_current_rate_limit(model, account, client)
        
        if limit is None or not limit.is_limited:
            # Model is available
            all_limited = False
            break
        
        if limit.available_at_unix <= now_ms:
            # Rate limit has expired
            all_limited = False
            break
        
        # Track earliest availability
        if earliest_available is None or limit.available_at_unix < earliest_available:
            earliest_available = limit.available_at_unix
    
    if not all_limited:
        return SolverAvailability(
            solver=solver,
            available=True,
            reason='Model available',
        )
    
    # All models rate limited
    available_at = datetime.fromtimestamp(earliest_available / 1000) if earliest_available else None
    return SolverAvailability(
        solver=solver,
        available=False,
        available_at=available_at,
        reason=f'Rate limited until {available_at.isoformat() if available_at else "unknown"}',
    )


def get_all_solver_availability(
    account: str = DEFAULT_ACCOUNT
) -> dict[str, SolverAvailability]:
    """Get availability status for all solvers"""
    solvers = ['angrav', 'jules', 'gemini', 'perplexity', 'local-slm']
    return {
        solver: check_solver_availability(solver, account)
        for solver in solvers
    }


def format_availability(availabilities: dict[str, SolverAvailability]) -> str:
    """Format availability for display"""
    lines = []
    lines.append("## Solver Availability")
    lines.append("")
    lines.append("| Solver | Status | Reason |")
    lines.append("|--------|--------|--------|")
    
    for solver, avail in availabilities.items():
        status = "✅ Available" if avail.available else "❌ Unavailable"
        reason = avail.reason or ""
        lines.append(f"| {solver} | {status} | {reason} |")
    
    return "\n".join(lines)


# CLI command
def cmd_availability(args):
    """Check solver availability"""
    account = getattr(args, 'account', DEFAULT_ACCOUNT)
    
    if not REDIS_AVAILABLE:
        print("⚠️ Redis package not installed. Install with: pip install redis")
        print("Showing static availability based on configuration...")
        print()
    
    availabilities = get_all_solver_availability(account)
    print(format_availability(availabilities))
    
    if args.json:
        import json as json_module
        output = {
            solver: {
                'available': avail.available,
                'available_at': avail.available_at.isoformat() if avail.available_at else None,
                'reason': avail.reason,
            }
            for solver, avail in availabilities.items()
        }
        print()
        print(json_module.dumps(output, indent=2))
