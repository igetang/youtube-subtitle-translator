#!/bin/bash

echo "=== 修复 WSL 代理设置 ==="

# 方法1：尝试从 ip route 获取 Windows 主机 IP
WIN_HOST=$(ip route | grep default | awk '{print $3}')

# 如果失败，使用备用方法
if [ -z "$WIN_HOST" ]; then
    # 尝试使用 PowerShell 获取
    WIN_HOST=$(powershell.exe -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {\$_.InterfaceAlias -like '*WSL*'} | Select-Object -ExpandProperty IPAddress" 2>/dev/null | tr -d '\r')
fi

# 如果还是失败，使用常见的默认值
if [ -z "$WIN_HOST" ]; then
    WIN_HOST="192.168.1.1"  # 你的网关地址
    echo "警告：无法自动检测 Windows 主机 IP，使用默认值: $WIN_HOST"
fi

echo "Windows 主机 IP: $WIN_HOST"
echo ""

# 设置正确的代理
echo "设置代理环境变量..."
echo "export http_proxy=http://$WIN_HOST:10808"
echo "export https_proxy=http://$WIN_HOST:10808"
echo "export HTTP_PROXY=http://$WIN_HOST:10808"
echo "export HTTPS_PROXY=http://$WIN_HOST:10808"
echo ""

# 创建配置文件
echo "创建持久化配置..."
cat > ~/.proxy_config << EOF
# WSL Proxy Configuration
export http_proxy=http://$WIN_HOST:10808
export https_proxy=http://$WIN_HOST:10808
export HTTP_PROXY=http://$WIN_HOST:10808
export HTTPS_PROXY=http://$WIN_HOST:10808
export no_proxy="localhost,127.0.0.1,::1"
export NO_PROXY="localhost,127.0.0.1,::1"
EOF

echo ""
echo "要应用这些设置，请运行："
echo "source ~/.proxy_config"
echo ""
echo "或者将以下行添加到 ~/.bashrc 中自动加载："
echo "[ -f ~/.proxy_config ] && source ~/.proxy_config"

