#!/bin/zsh
actualDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
folderName="SafariConverted"

if ! type "yarn" > /dev/null; then
    echo "[-] Yarn not found. Exiting..."
    exit -1
fi

if [ -d "$actualDIR/$folderName" ]
then
    echo "[+] Folder for Converted Extension exists!"
    rm -R "$actualDIR/$folderName"
    mkdir "$actualDIR/$folderName"
else
    echo "[-] Didn't found Folder for Converted Extension. Creating it now..."
    mkdir "$actualDIR/$folderName"
fi

echo "[+] Installing dependencies for extension..."
yarn_output=$(yarn 2>&1)
if [[ "$yarn_output" == *"Error"* ]]
then
    echo "[-] Installing dependencies failed..."
    exit -1
else
    echo "[+] Installed dependencies!"
fi
echo "[+] Building PreMiD extension..."
yarnbuild_output=$(yarn build 2>&1)
if [[ "$yarnbuild_output" == *"ERROR"* ]]
then
    echo "[-] Build failed..."
    exit -1
else
    echo "[+] Build succeeded"
fi
echo "[+] Converting PreMiD extension to Safari extension in Swift language..."
yes "" | xcrun safari-web-extension-converter $actualDIR/dist --project-location "$actualDIR/$folderName" --app-name "PreMiD-Extension" --bundle-identifier "timeraa.PreMiD" --swift
echo "[+] Converted PreMiD extension to Safari extension! Ending..."
exit 0