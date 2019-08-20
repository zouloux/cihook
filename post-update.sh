#/usr/local/bin/node /var/services/homes/git/git-hooks/index.js
echo "script"
#git log "${1}..${2}"
echo $0;
echo $1;
#echo $2;
commitMsg=$(git log -1 --pretty=%B)
echo $commitMsg
pwd