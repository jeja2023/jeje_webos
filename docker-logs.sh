#!/bin/bash
# JeJe WebOS Docker 日志查看脚本

# 如果没有指定服务，显示所有服务日志
if [ -z "$1" ]; then
    docker-compose logs -f
else
    docker-compose logs -f "$1"
fi

