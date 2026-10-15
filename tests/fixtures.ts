// Recorded from a demo repository by the author's harness: real git output, paths rewritten under /work/demo/repo.
export const ROOT = "/work/demo/repo"
export const MERGE_SHA = "608ed56b1205042af2d0a1479e695b28fecd13ef"
export const PLAIN_SHA = "cfd06f32e47b59300a56979d6b0de88577ce9da7"
export type Recorded = { exitCode: number; stdout: string; stderr: string }
export const FIXTURES: Record<string, Recorded> = {
 "status\u0001--porcelain=v2\u0001--branch\u0001--show-stash\u0001-z": {
  "exitCode": 0,
  "stdout": "# branch.oid e99b652d68fbe82106c978527388722ba343a26a\u0000# branch.head main\u0000# branch.upstream origin/main\u0000# branch.ab +1 -0\u0000# stash 1\u00001 .M N... 100644 100644 100644 678a5666d9db29cc10cd415e7e1b121a6f8bdf55 678a5666d9db29cc10cd415e7e1b121a6f8bdf55 README.md\u00001 MM N... 100644 100644 100644 74cdb8b2fd8a4836bc51617cbdd71f9f4a0e1a85 c4d837507eeb5991a6db2eb10ccda7d095af111e app.js\u00002 R. N... 100644 100644 100644 b22e185e508f33d697c957a1d8404d6234d984dd b22e185e508f33d697c957a1d8404d6234d984dd R100 auth.js\u0000login.js\u0000? notes.txt\u0000",
  "stderr": ""
 },
 "remote\u0001-v": {
  "exitCode": 0,
  "stdout": "origin\t../origin.git (fetch)\norigin\t../origin.git (push)\n",
  "stderr": ""
 },
 "log\u0001--date-order\u0001--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%s\u0001-n151\u0001--branches\u0001--remotes\u0001--tags\u0001HEAD": {
  "exitCode": 0,
  "stdout": "\u001ee99b652d68fbe82106c978527388722ba343a26a\u001f624fbc2f0c82dd47a4f4ba56a2b30f1adaab078d\u001fAda Lovelace\u001fada@example.com\u001f1789113600\u001fHEAD -> main\u001fdocs: unpushed change\n\u001e624fbc2f0c82dd47a4f4ba56a2b30f1adaab078d\u001f608ed56b1205042af2d0a1479e695b28fecd13ef\u001fAda Lovelace\u001fada@example.com\u001f1789027200\u001forigin/main\u001fdocs: more readme\n\u001e2be374e7b6baecd124a0ec2de0d0025772adebdc\u001f8d00087335d42f778873c2672fd5c262f0f1b746\u001fAda Lovelace\u001fada@example.com\u001f1788940800\u001forigin/feature/api, feature/api\u001ffeat(api): second endpoint\n\u001e8d00087335d42f778873c2672fd5c262f0f1b746\u001f608ed56b1205042af2d0a1479e695b28fecd13ef\u001fAda Lovelace\u001fada@example.com\u001f1788854400\u001f\u001ffeat(api): first endpoint\n\u001e608ed56b1205042af2d0a1479e695b28fecd13ef\u001f3d3a2564845e033d83430dd9c510157dc6b8c89b cfd06f32e47b59300a56979d6b0de88577ce9da7\u001fAda Lovelace\u001fada@example.com\u001f1788768000\u001ftag: v1.0, hotfix\u001fMerge branch 'feature/login'\n\u001e3d3a2564845e033d83430dd9c510157dc6b8c89b\u001f73a8eab5c2b46c826bb825d238ff9399108bdf47\u001fAda Lovelace\u001fada@example.com\u001f1788681600\u001f\u001ffix: main work in parallel\n\u001ecfd06f32e47b59300a56979d6b0de88577ce9da7\u001ff2f1a07d3c1ce9697102cae71f9fff82e88ac46a\u001fAda Lovelace\u001fada@example.com\u001f1788595200\u001ffeature/login\u001ffeat(login): validate input\n\u001ef2f1a07d3c1ce9697102cae71f9fff82e88ac46a\u001f73a8eab5c2b46c826bb825d238ff9399108bdf47\u001fAda Lovelace\u001fada@example.com\u001f1788508800\u001f\u001ffeat(login): add login stub\n\u001e73a8eab5c2b46c826bb825d238ff9399108bdf47\u001fec145643af41413c30399d630b6f844540fe8d1e\u001fAda Lovelace\u001fada@example.com\u001f1788422400\u001f\u001fchore: config comments\n\u001eec145643af41413c30399d630b6f844540fe8d1e\u001f38b46e886595c3e51602c8b8b44d01d134ad8a64\u001fAda Lovelace\u001fada@example.com\u001f1788336000\u001ftag: v0.9\u001ffeat: add app entry point\n\u001e38b46e886595c3e51602c8b8b44d01d134ad8a64\u001f\u001fAda Lovelace\u001fada@example.com\u001f1788249600\u001f\u001fInitial commit\n",
  "stderr": ""
 },
 "for-each-ref\u0001--sort=-committerdate\u0001--format=%(refname)%1f%(refname:short)%1f%(objectname)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(HEAD)%1f%(committerdate:unix)%1f%(worktreepath)%1f%(symref)%1f%(contents:subject)\u0001refs/heads\u0001refs/remotes": {
  "exitCode": 0,
  "stdout": "refs/heads/main\u001fmain\u001fe99b652d68fbe82106c978527388722ba343a26a\u001forigin/main\u001fahead 1\u001f*\u001f1789113600\u001f/work/demo/repo\u001f\u001fdocs: unpushed change\nrefs/remotes/origin/main\u001forigin/main\u001f624fbc2f0c82dd47a4f4ba56a2b30f1adaab078d\u001f\u001f\u001f \u001f1789027200\u001f\u001f\u001fdocs: more readme\nrefs/heads/feature/api\u001ffeature/api\u001f2be374e7b6baecd124a0ec2de0d0025772adebdc\u001forigin/feature/api\u001f\u001f \u001f1788940800\u001f\u001f\u001ffeat(api): second endpoint\nrefs/remotes/origin/feature/api\u001forigin/feature/api\u001f2be374e7b6baecd124a0ec2de0d0025772adebdc\u001f\u001f\u001f \u001f1788940800\u001f\u001f\u001ffeat(api): second endpoint\nrefs/heads/hotfix\u001fhotfix\u001f608ed56b1205042af2d0a1479e695b28fecd13ef\u001f\u001f\u001f \u001f1788768000\u001f/work/demo/repo-hotfix\u001f\u001fMerge branch 'feature/login'\nrefs/heads/feature/login\u001ffeature/login\u001fcfd06f32e47b59300a56979d6b0de88577ce9da7\u001f\u001f\u001f \u001f1788595200\u001f\u001f\u001ffeat(login): validate input\n",
  "stderr": ""
 },
 "for-each-ref\u0001--sort=-creatordate\u0001--format=%(refname:short)%1f%(objecttype)%1f%(objectname)%1f%(*objectname)%1f%(creatordate:unix)%1f%(contents:subject)\u0001refs/tags": {
  "exitCode": 0,
  "stdout": "v1.0\u001ftag\u001fb6799500bc33b4f1c558f46e21d6a36605930876\u001f608ed56b1205042af2d0a1479e695b28fecd13ef\u001f1792053232\u001fRelease 1.0\nv0.9\u001fcommit\u001fec145643af41413c30399d630b6f844540fe8d1e\u001f\u001f1788336000\u001ffeat: add app entry point\n",
  "stderr": ""
 },
 "worktree\u0001list\u0001--porcelain": {
  "exitCode": 0,
  "stdout": "worktree /work/demo/repo\nHEAD e99b652d68fbe82106c978527388722ba343a26a\nbranch refs/heads/main\n\nworktree /work/demo/repo-hotfix\nHEAD 608ed56b1205042af2d0a1479e695b28fecd13ef\nbranch refs/heads/hotfix\n\n",
  "stderr": ""
 },
 "stash\u0001list\u0001--format=%gd%x1f%H%x1f%ct%x1f%gs": {
  "exitCode": 0,
  "stdout": "stash@{0}\u001f5c77e5b07d57fd8df049158b9e071b43e78a0378\u001f1792053232\u001fOn main: WIP experiment\n",
  "stderr": ""
 },
 "reflog\u0001show\u0001--format=%gd%x1f%H%x1f%ct%x1f%gs\u0001-n150\u0001HEAD": {
  "exitCode": 0,
  "stdout": "HEAD@{0}\u001fe99b652d68fbe82106c978527388722ba343a26a\u001f1789113600\u001freset: moving to HEAD\nHEAD@{1}\u001fe99b652d68fbe82106c978527388722ba343a26a\u001f1789113600\u001fcommit: docs: unpushed change\nHEAD@{2}\u001f624fbc2f0c82dd47a4f4ba56a2b30f1adaab078d\u001f1789027200\u001fcommit: docs: more readme\nHEAD@{3}\u001f608ed56b1205042af2d0a1479e695b28fecd13ef\u001f1788768000\u001fcheckout: moving from feature/api to main\nHEAD@{4}\u001f2be374e7b6baecd124a0ec2de0d0025772adebdc\u001f1788940800\u001fcommit: feat(api): second endpoint\nHEAD@{5}\u001f8d00087335d42f778873c2672fd5c262f0f1b746\u001f1788854400\u001fcommit: feat(api): first endpoint\nHEAD@{6}\u001f608ed56b1205042af2d0a1479e695b28fecd13ef\u001f1788768000\u001fcheckout: moving from main to feature/api\nHEAD@{7}\u001f608ed56b1205042af2d0a1479e695b28fecd13ef\u001f1788768000\u001fmerge feature/login: Merge made by the 'ort' strategy.\nHEAD@{8}\u001f3d3a2564845e033d83430dd9c510157dc6b8c89b\u001f1788681600\u001fcommit: fix: main work in parallel\nHEAD@{9}\u001f73a8eab5c2b46c826bb825d238ff9399108bdf47\u001f1788422400\u001fcheckout: moving from feature/login to main\nHEAD@{10}\u001fcfd06f32e47b59300a56979d6b0de88577ce9da7\u001f1788595200\u001fcommit: feat(login): validate input\nHEAD@{11}\u001ff2f1a07d3c1ce9697102cae71f9fff82e88ac46a\u001f1788508800\u001fcommit: feat(login): add login stub\nHEAD@{12}\u001f73a8eab5c2b46c826bb825d238ff9399108bdf47\u001f1788422400\u001fcheckout: moving from main to feature/login\nHEAD@{13}\u001f73a8eab5c2b46c826bb825d238ff9399108bdf47\u001f1788422400\u001fcommit: chore: config comments\nHEAD@{14}\u001fec145643af41413c30399d630b6f844540fe8d1e\u001f1788336000\u001fcommit: feat: add app entry point\nHEAD@{15}\u001f38b46e886595c3e51602c8b8b44d01d134ad8a64\u001f1788249600\u001fcommit (initial): Initial commit\n",
  "stderr": ""
 },
 "show\u0001-s\u0001--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%D%x1f%B\u0001608ed56b1205042af2d0a1479e695b28fecd13ef": {
  "exitCode": 0,
  "stdout": "608ed56b1205042af2d0a1479e695b28fecd13ef\u001f3d3a2564845e033d83430dd9c510157dc6b8c89b cfd06f32e47b59300a56979d6b0de88577ce9da7\u001fAda Lovelace\u001fada@example.com\u001f1788768000\u001fAda Lovelace\u001f1788768000\u001ftag: v1.0, hotfix\u001fMerge branch 'feature/login'\n\n",
  "stderr": ""
 },
 "diff\u0001--name-status\u0001-z\u0001-M\u0001608ed56b1205042af2d0a1479e695b28fecd13ef^1\u0001608ed56b1205042af2d0a1479e695b28fecd13ef": {
  "exitCode": 0,
  "stdout": "A\u0000login.js\u0000",
  "stderr": ""
 },
 "diff\u0001--numstat\u0001-z\u0001-M\u0001608ed56b1205042af2d0a1479e695b28fecd13ef^1\u0001608ed56b1205042af2d0a1479e695b28fecd13ef": {
  "exitCode": 0,
  "stdout": "2\t0\tlogin.js\u0000",
  "stderr": ""
 },
 "show\u0001-s\u0001--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%D%x1f%B\u0001cfd06f32e47b59300a56979d6b0de88577ce9da7": {
  "exitCode": 0,
  "stdout": "cfd06f32e47b59300a56979d6b0de88577ce9da7\u001ff2f1a07d3c1ce9697102cae71f9fff82e88ac46a\u001fAda Lovelace\u001fada@example.com\u001f1788595200\u001fAda Lovelace\u001f1788595200\u001ffeature/login\u001ffeat(login): validate input\n\n",
  "stderr": ""
 },
 "diff-tree\u0001-r\u0001-z\u0001--no-commit-id\u0001--name-status\u0001-M\u0001--root\u0001cfd06f32e47b59300a56979d6b0de88577ce9da7": {
  "exitCode": 0,
  "stdout": "M\u0000login.js\u0000",
  "stderr": ""
 },
 "diff-tree\u0001-r\u0001-z\u0001--no-commit-id\u0001--numstat\u0001-M\u0001--root\u0001cfd06f32e47b59300a56979d6b0de88577ce9da7": {
  "exitCode": 0,
  "stdout": "1\t0\tlogin.js\u0000",
  "stderr": ""
 },
 "show\u0001--no-ext-diff\u0001--format=\u0001-M\u0001cfd06f32e47b59300a56979d6b0de88577ce9da7\u0001--\u0001login.js": {
  "exitCode": 0,
  "stdout": "diff --git a/login.js b/login.js\nindex 934bf2a..b22e185 100644\n--- a/login.js\n+++ b/login.js\n@@ -1 +1,2 @@\n export function login() {}\n+// validate\n",
  "stderr": ""
 },
 "diff\u0001--no-ext-diff\u0001--\u0001app.js": {
  "exitCode": 0,
  "stdout": "diff --git a/app.js b/app.js\nindex c4d8375..3122fc1 100644\n--- a/app.js\n+++ b/app.js\n@@ -2,3 +2,4 @@ console.log('v1')\n // config\n // main work\n staged\n+more\n",
  "stderr": ""
 },
 "diff\u0001--no-ext-diff\u0001--\u0001README.md": {
  "exitCode": 0,
  "stdout": "diff --git a/README.md b/README.md\nindex 678a566..a1cc5e6 100644\n--- a/README.md\n+++ b/README.md\n@@ -1,3 +1,4 @@\n # Demo\n More docs\n Unpushed\n+line\n",
  "stderr": ""
 },
 "diff\u0001--cached\u0001--no-ext-diff\u0001-M\u0001--\u0001app.js": {
  "exitCode": 0,
  "stdout": "diff --git a/app.js b/app.js\nindex 74cdb8b..c4d8375 100644\n--- a/app.js\n+++ b/app.js\n@@ -1,3 +1,4 @@\n console.log('v1')\n // config\n // main work\n+staged\n",
  "stderr": ""
 },
 "diff\u0001--cached\u0001--no-ext-diff\u0001-M\u0001--\u0001auth.js\u0001login.js": {
  "exitCode": 0,
  "stdout": "diff --git a/login.js b/auth.js\nsimilarity index 100%\nrename from login.js\nrename to auth.js\n",
  "stderr": ""
 },
 "diff\u0001--no-ext-diff\u0001--no-index\u0001--\u0001/dev/null\u0001notes.txt": {
  "exitCode": 1,
  "stdout": "diff --git a/notes.txt b/notes.txt\nnew file mode 100644\nindex 0000000..fa49b07\n--- /dev/null\n+++ b/notes.txt\n@@ -0,0 +1 @@\n+new file\n",
  "stderr": ""
 },
 "stash\u0001show\u0001-p\u0001--include-untracked\u0001--no-ext-diff\u0001stash@{0}": {
  "exitCode": 0,
  "stdout": "diff --git a/app.js b/app.js\nindex 74cdb8b..27d627f 100644\n--- a/app.js\n+++ b/app.js\n@@ -1,3 +1,4 @@\n console.log('v1')\n // config\n // main work\n+stash me\n",
  "stderr": ""
 }
}
