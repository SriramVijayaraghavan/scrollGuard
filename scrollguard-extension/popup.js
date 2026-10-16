const $=i=>document.getElementById(i);
chrome.storage.local.get('cfg',r=>{if(r.cfg)$('c').value=JSON.stringify(r.cfg)});
$('s').onclick=()=>{try{const c=JSON.parse($('c').value);if(!c.apps)throw 0;chrome.storage.local.set({cfg:c},()=>$('m').textContent='Saved ✓ – reload the tab')}catch{$('m').textContent='Invalid config'}};
