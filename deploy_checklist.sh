#!/usr/bin/env bash
# MAESTRO Deployment Checklist
# Use this script to verify everything is ready before deploying
# Run: ./deploy_checklist.sh or bash deploy_checklist.sh

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counter
CHECKS_PASSED=0
CHECKS_FAILED=0

# Helper function
check() {
    local description=$1
    local command=$2
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $description"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}✗${NC} $description"
        ((CHECKS_FAILED++))
    fi
}

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   MAESTRO DEPLOYMENT CHECKLIST            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"

# === ENVIRONMENT CHECKS ===
echo -e "${BLUE}[1] Environment${NC}"
check "Python 3.11+ installed" "python3 --version | grep -E '3.1[1-9]|3.[2-9]|[4-9]'"
check "Node.js 18+ installed" "node --version | grep -E 'v1[8-9]|v[2-9]'"
check "npm installed" "npm --version"

echo ""
echo -e "${BLUE}[2] Project Files${NC}"
check "App directory exists" "test -d ."
check "Backend directory exists" "test -d backend"
check "package.json exists" "test -f package.json"
check "backend/requirements.txt exists" "test -f backend/requirements.txt"
check "backend/main.py exists" "test -f backend/app/main.py"
check "autotune_v3.py exists" "test -f backend/app/services/autotune_v3.py"
check "vocal_intelligence.py exists" "test -f backend/app/services/vocal_intelligence.py"
check "virtual_band.py exists" "test -f backend/app/services/virtual_band.py"

echo ""
echo -e "${BLUE}[3] Dependencies (Required)${NC}"
check "FastAPI installed" "python3 -c 'import fastapi'"
check "Uvicorn installed" "python3 -c 'import uvicorn'"
check "NumPy installed" "python3 -c 'import numpy'"
check "NumPy is 1.x (not 2.x)" "python3 -c 'import numpy; assert int(numpy.__version__.split(\".\")[0]) == 1, \"NumPy must be 1.x\"'"
check "SciPy installed" "python3 -c 'import scipy'"
check "Soundfile installed" "python3 -c 'import soundfile'"

echo ""
echo -e "${BLUE}[4] Frontend Dependencies${NC}"
check "React installed" "npm list react 2>/dev/null | grep -q react"
check "Expo installed" "npm list expo 2>/dev/null | grep -q expo"
check "Supabase JS installed" "npm list @supabase/supabase-js 2>/dev/null | grep -q supabase"

echo ""
echo -e "${BLUE}[5] Configuration Files${NC}"
check ".env.example exists (root)" "test -f .env.example"
check "backend/.env.example exists" "test -f backend/.env.example"
check "COMMANDS.md exists" "test -f COMMANDS.md"
check "README_COMPLETE.md exists" "test -f README_COMPLETE.md"
check "SETUP.md exists" "test -f SETUP.md"

echo ""
echo -e "${BLUE}[6] Backend Code Quality${NC}"
check "main.py has lifespan context" "grep -q 'async with lifespan' backend/app/main.py"
check "main.py has /health endpoint" "grep -q 'def health' backend/app/main.py"
check "audio_routes imports autotune_v3" "grep -q 'from.*autotune_v3' backend/app/routes/audio_routes.py"
check "audio_routes has /upload-and-process" "grep -q '/audio/upload-and-process' backend/app/routes/audio_routes.py"
check "StudioScreen uses FormData" "grep -q 'FormData' src/screens/StudioScreen.tsx"
check "StudioScreen uploads to /upload-and-process" "grep -q 'upload-and-process' src/screens/StudioScreen.tsx"

echo ""
echo -e "${BLUE}[7] Memory & Performance${NC}"
check "requirements.txt pinned versions" "grep -q '==' backend/requirements.txt"
check "numpy version is 1.26.4" "grep -q 'numpy==1.26.4' backend/requirements.txt"
check "No librosa at module level" "! grep -q '^import librosa' backend/app/main.py"
check "No numpy at module level" "! grep -q '^import numpy' backend/app/main.py"

echo ""
echo -e "${BLUE}[8] Deployment Config${NC}"
check "nixpacks.toml exists" "test -f backend/nixpacks.toml"
check "app.json exists" "test -f app.json"
check "tsconfig.json exists" "test -f tsconfig.json"

echo ""
echo -e "${BLUE}[9] Verification Tools${NC}"
check "verify_system.py exists" "test -f verify_system.py"
check "deploy_checklist.sh is executable" "test -x deploy_checklist.sh || echo 'Making executable...' && chmod +x deploy_checklist.sh"

echo ""
echo -e "${BLUE}═════════════════════════════════════════════${NC}"
echo -e "${BLUE}[SUMMARY]${NC}"
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC}"
echo -e "${RED}Failed: $CHECKS_FAILED${NC}"

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All checks passed!${NC}"
    echo -e "\n${BLUE}Next steps:${NC}"
    echo "1. Fill in .env and backend/.env with real credentials"
    echo "2. Run backend: cd backend && python -m uvicorn app.main:app --reload"
    echo "3. Run frontend: npm start"
    echo "4. Test: curl http://localhost:8000/health"
    echo ""
    echo -e "${GREEN}Ready to deploy to Railway!${NC}"
    echo "See COMMANDS.md for deployment instructions"
    exit 0
else
    echo -e "\n${YELLOW}⚠ Some checks failed. Please fix the above issues.${NC}"
    echo -e "\n${BLUE}Common fixes:${NC}"
    echo "• Python dependencies: cd backend && pip install -r requirements.txt"
    echo "• Node dependencies: npm install --legacy-peer-deps"
    echo "• Environment: Copy .env.example to .env and fill in credentials"
    exit 1
fi
