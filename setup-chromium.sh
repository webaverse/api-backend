#!/bin/bash
yum update -y

yum install -y gcc openssl-devel bzip2-devel libffi-devel 
sudo amazon-linux-extras install epel -y

wget https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm 
sudo yum install -y ./google-chrome-stable_current_*.rpm

sudo yum install chromium -y

yum install xorg-x11-xauth -y
yum install xclock xterm -y

# clean up file
rm -Rf ~/dev/demo/google-chrome-stable_current_x86_64.rpm
echo "********* INSTALLED"