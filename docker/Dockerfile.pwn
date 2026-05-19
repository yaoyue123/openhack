FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    python3 python3-pip git gdb wget \
    checksec binutils \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install pwntools
RUN git clone https://github.com/pwndbg/pwndbg /opt/pwndbg && cd /opt/pwndbg && ./setup.sh
WORKDIR /workspace
