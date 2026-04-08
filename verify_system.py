#!/usr/bin/env python3
"""
MAESTRO System Verification Script
Checks all components are working correctly before running locally or deploying
Run: python verify_system.py
"""

import subprocess
import sys
import os
from pathlib import Path

# Color codes
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

failed_checks = []
passed_checks = []

def print_header(text):
    """Print section header"""
    print(f"\n{BLUE}{'='*60}")
    print(f"{text}")
    print(f"{'='*60}{RESET}\n")

def check_python_version():
    """Verify Python 3.11+"""
    print_header("🐍 PYTHON VERSION CHECK")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 11:
        print(f"{GREEN}✓{RESET} Python {version.major}.{version.minor}.{version.micro}")
        passed_checks.append("Python version")
    else:
        print(f"{RED}✗{RESET} Python {version.major}.{version.minor} (need 3.11+)")
        failed_checks.append("Python version")

def check_backend_dependencies():
    """Verify all backend packages are installed"""
    print_header("📦 BACKEND DEPENDENCIES")
    
    required_packages = {
        'fastapi': 'FastAPI',
        'uvicorn': 'Uvicorn',
        'librosa': 'Librosa',
        'numpy': 'NumPy',
        'scipy': 'SciPy',
        'soundfile': 'Soundfile',
        'audioread': 'Audioread',
        'supabase': 'Supabase',
        'openai': 'OpenAI',
        'dotenv': 'Python-Dotenv',
    }
    
    for package, name in required_packages.items():
        try:
            __import__(package)
            print(f"{GREEN}✓{RESET} {name}")
            passed_checks.append(name)
        except ImportError:
            print(f"{RED}✗{RESET} {name} (install: pip install {package})")
            failed_checks.append(name)

def check_numpy_version():
    """Verify NumPy is 1.x not 2.x"""
    print_header("🔢 NUMPY VERSION CHECK")
    try:
        import numpy as np
        version = np.__version__
        major = int(version.split('.')[0])
        if major == 1:
            print(f"{GREEN}✓{RESET} NumPy {version} (correct: 1.x)")
            passed_checks.append("NumPy version")
        else:
            print(f"{RED}✗{RESET} NumPy {version} (need 1.x, NOT 2.x)")
            failed_checks.append("NumPy version")
    except ImportError:
        print(f"{RED}✗{RESET} NumPy not installed")
        failed_checks.append("NumPy")

def check_audio_services():
    """Verify audio service modules load correctly"""
    print_header("🎵 AUDIO SERVICES CHECK")
    
    services = {
        'autotune_v3': 'AutoTune Engine',
        'vocal_intelligence': 'Vocal Intelligence',
        'virtual_band': 'Virtual Band',
    }
    
    # Add backend to path
    backend_path = Path(__file__).parent / 'backend'
    sys.path.insert(0, str(backend_path))
    
    for module, name in services.items():
        try:
            # Just check if the module exists without full import
            file_path = backend_path / 'app' / 'services' / f'{module}.py'
            if file_path.exists():
                print(f"{GREEN}✓{RESET} {name} service file exists")
                passed_checks.append(f"{name} file")
            else:
                print(f"{RED}✗{RESET} {name} service file missing")
                failed_checks.append(f"{name} file")
        except Exception as e:
            print(f"{RED}✗{RESET} {name}: {str(e)}")
            failed_checks.append(name)

def check_main_app():
    """Verify main FastAPI app starts"""
    print_header("🚀 FASTAPI APP CHECK")
    backend_path = Path(__file__).parent / 'backend'
    sys.path.insert(0, str(backend_path))
    
    try:
        from app.main import app
        print(f"{GREEN}✓{RESET} FastAPI app loads successfully")
        passed_checks.append("FastAPI app")
        
        # Check if health endpoint exists
        routes = [route.path for route in app.routes]
        if '/health' in routes:
            print(f"{GREEN}✓{RESET} /health endpoint configured")
            passed_checks.append("Health endpoint")
        else:
            print(f"{RED}✗{RESET} /health endpoint missing")
            failed_checks.append("Health endpoint")
            
    except Exception as e:
        print(f"{RED}✗{RESET} FastAPI app error: {str(e)}")
        failed_checks.append("FastAPI app")

def check_env_files():
    """Verify .env files exist"""
    print_header("🔐 ENVIRONMENT FILES CHECK")
    
    files_to_check = [
        ('Backend', '.env'),
        ('Backend Template', 'backend/.env.example'),
        ('Frontend Template', '.env.example'),
    ]
    
    for name, filepath in files_to_check:
        if Path(filepath).exists():
            print(f"{GREEN}✓{RESET} {name} file exists")
            passed_checks.append(f"{name} file")
        else:
            print(f"{YELLOW}⚠{RESET} {name} file missing (copy .env.example first)")
            if '.example' not in filepath:
                failed_checks.append(f"{name} file")

def check_supabase_config():
    """Verify Supabase config exists"""
    print_header("🔗 SUPABASE CONFIG CHECK")
    
    supabase_path = Path('src/services/supabase.ts')
    if supabase_path.exists():
        print(f"{GREEN}✓{RESET} supabase.ts exists")
        passed_checks.append("Supabase config")
    else:
        print(f"{RED}✗{RESET} supabase.ts missing")
        failed_checks.append("Supabase config")

def check_studio_screen():
    """Verify StudioScreen exists"""
    print_header("📱 FRONTEND COMPONENTS CHECK")
    
    studio_path = Path('src/screens/StudioScreen.tsx')
    if studio_path.exists():
        print(f"{GREEN}✓{RESET} StudioScreen.tsx exists")
        passed_checks.append("StudioScreen")
        
        # Check if it has FormData
        with open(studio_path, 'r') as f:
            content = f.read()
            if 'FormData' in content and 'upload-and-process' in content:
                print(f"{GREEN}✓{RESET} FormData upload implementation found")
                passed_checks.append("FormData upload")
            else:
                print(f"{RED}✗{RESET} FormData upload implementation missing")
                failed_checks.append("FormData upload")
    else:
        print(f"{RED}✗{RESET} StudioScreen.tsx missing")
        failed_checks.append("StudioScreen")

def print_summary():
    """Print final summary"""
    print_header("📊 SUMMARY")
    
    total = len(passed_checks) + len(failed_checks)
    passed = len(passed_checks)
    
    print(f"{GREEN}✓ Passed:{RESET} {passed}/{total}")
    
    if failed_checks:
        print(f"{RED}✗ Failed:{RESET} {len(failed_checks)}/{total}")
        print(f"\n{RED}Failed checks:{RESET}")
        for check in failed_checks:
            print(f"  • {check}")
    else:
        print(f"\n{GREEN}{'='*60}")
        print(f"🎉 ALL SYSTEMS GO! 🎉")
        print(f"{'='*60}{RESET}")
        print(f"\nYou can now run:")
        print(f"  {BLUE}cd backend && python -m uvicorn app.main:app --reload{RESET}")
        print(f"  {BLUE}npm start{RESET}")
        return True
    
    return False

def main():
    """Run all checks"""
    print(f"\n{BLUE}{'='*60}")
    print(f"MAESTRO SYSTEM VERIFICATION")
    print(f"{'='*60}{RESET}\n")
    
    check_python_version()
    check_numpy_version()
    check_backend_dependencies()
    check_audio_services()
    check_main_app()
    check_env_files()
    check_supabase_config()
    check_studio_screen()
    
    success = print_summary()
    
    return 0 if success else 1

if __name__ == '__main__':
    sys.exit(main())
