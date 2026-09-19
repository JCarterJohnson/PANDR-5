import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';
import { mkdir } from 'node:fs/promises';
const evidence='/tmp/pandr-5-qa';

test('unsaved preview, explanations, account jump, themes and creator links', async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page).toHaveTitle(/PANDR/);await expect(page.getByText('Unsaved preview.',{exact:true})).toBeVisible();
 await expect(page.getByText('Training, considered.')).toHaveCount(0);await expect(page.getByText('A clear plan. One working set at a time.')).toHaveCount(0);
 await expect(page.locator('.volume-mini .bar i').first()).toHaveAttribute('style','width: 0%;');await expect(page.locator('.volume-mini').first()).toContainText('0 / 20');
 await page.getByRole('button',{name:'Your plan',exact:true}).click();await page.getByRole('button',{name:'How weekly targets and exercise sets work'}).click();await expect(page.getByRole('dialog')).toContainText('Typing a number changes that goal');await page.getByRole('button',{name:'Close dialog'}).click();
 await page.locator('.sidebar-bottom').getByRole('button',{name:'Sign in with Google'}).click();await expect(page.locator('#account')).toBeInViewport();await expect(page.locator('#account')).toBeFocused();
 await page.getByRole('button',{name:'Explain load changes in The method'}).click();await expect(page.locator('#load-progression')).toBeInViewport();await expect(page.locator('#load-progression')).toContainText('102.5 kg');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Appearance').selectOption('dark');await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.getByRole('link',{name:'Buy Me a Coffee',exact:true})).toHaveAttribute('href','https://buymeacoffee.com/iamjohncaru');await expect(page.getByRole('link',{name:/Instagram ·/})).toHaveAttribute('href','https://www.instagram.com/cj.fitguy/');await expect(page.getByRole('link',{name:/Reddit ·/})).toHaveAttribute('href','https://www.reddit.com/user/iamjohncarterofmars/');
 await page.getByLabel('Appearance').selectOption('automatic');await page.getByRole('button',{name:'Save preferences'}).click();await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByLabel('Your name').fill('Unsaved name');await page.getByRole('button',{name:'Save preferences'}).click();await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByLabel('Your name')).toHaveValue('');
 expect(errors).toEqual([]);
});

test('account workout saving, collapsed navigation, accurate volume and cycle archive',async({page})=>{
 const account=await accountFixture(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('button',{name:'Start session',exact:true}).click();await expect(page.locator('.app-shell')).toHaveClass(/workout-focus/);
 await expect.poll(()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
 await page.getByLabel('Set 1 reps',{exact:true}).fill('8');await page.getByRole('button',{name:'Log set 1',exact:true}).click();await expect(page.getByRole('button',{name:'Unlog set 1',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await expect(page.locator('.sidebar')).toHaveClass(/open/);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('.sidebar-bottom').getByRole('button',{name:account.email}).click();await expect(page.locator('#account')).toBeInViewport();
 await page.getByRole('button',{name:'Train',exact:true}).click();await page.getByRole('button',{name:'Finish session',exact:true}).click();await page.getByRole('button',{name:/Finish with .* unlogged sets/}).click();await expect(page.locator('.app-shell')).not.toHaveClass(/workout-focus/);
 await expect(page.locator('.volume-mini')).toContainText('1 / 20');await expect(page.locator('.volume-mini .bar i').first()).toHaveAttribute('style','width: 5%;');
 await expect.poll(()=>account.getHead()?.records.length).toBe(1);
 await page.reload();await expect(page.locator('.volume-mini')).toContainText('1 / 20');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Start a new cycle'}).click();await page.getByLabel('Cycle name').fill('Return to training');await page.getByRole('button',{name:'Start cycle',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Train',exact:true}).click();await expect(page.locator('.volume-mini')).toContainText('0 / 20');await expect(page.getByRole('button',{name:'Start session',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'History',exact:true}).click();await page.getByLabel('Training cycle').selectOption({index:1});await expect(page.locator('.history-row')).toHaveCount(1);await page.getByRole('button',{name:'View Cycle 1 archived plan'}).click();await expect(page.getByRole('dialog')).toContainText('Bench Press');await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Appearance').selectOption('dark');await page.getByRole('button',{name:'Save preferences'}).click();await expect.poll(()=>account.getHead()?.metadata.settings.theme).toBe('dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await mkdir(evidence,{recursive:true});await page.screenshot({path:`${evidence}/train-dark-desktop.png`,fullPage:true});
 const profiles=await page.evaluate(async()=>{const dbs=await indexedDB.databases();if(!dbs.some(d=>d.name==='pandr5'))return [];return new Promise<any[]>((resolve,reject)=>{const r=indexedDB.open('pandr5');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('profiles').objectStore('profiles').getAll();q.onsuccess=()=>{resolve(q.result);db.close()}}})});expect(profiles).toEqual([]);
 expect(errors).toEqual([]);
});

test('check-in prompts follow live device date and allow only one per cycle week',async({page})=>{
 await page.clock.install({time:new Date('2026-09-18T12:00:00')});await accountFixture(page);await page.goto('/');
 await expect(page.getByRole('button',{name:'Check in',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Day 4 Active Rest'}).click();await expect(page.getByRole('button',{name:'Record a check-in'})).toHaveCount(0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Check-in weekday').selectOption('6');await page.getByRole('button',{name:'Save preferences'}).click();await page.getByRole('button',{name:'Train',exact:true}).click();
 await page.clock.setSystemTime(new Date('2026-09-19T00:00:00'));await page.clock.runFor(1100);await expect(page.getByRole('button',{name:'Check in',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Check in',exact:true}).click();await page.getByLabel('Average sleep per night (hours)').fill('6.5');await page.getByLabel('Fatigue this week').selectOption('4');await page.getByLabel('Repeated poor sleep this week compared with your usual sleep').check();await page.getByLabel('Persistent or recurring joint pain').check();await page.getByRole('button',{name:'Save check-in'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Check in',exact:true})).toHaveCount(0);
 await page.clock.setSystemTime(new Date('2026-09-25T12:00:00'));await page.clock.runFor(1100);await expect(page.getByText('Pivot week.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Check in',exact:true})).toHaveCount(0);
});

test('failed cloud writes stay unsaved until retried; sign-out never exposes account data',async({page})=>{
 const account=await accountFixture(page);await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Your name').fill('Saved person');await page.getByRole('button',{name:'Save preferences'}).click();await expect.poll(()=>account.getHead()?.metadata.settings.name).toBe('Saved person');
 account.setFailure(true);await page.getByLabel('Your name').fill('Pending person');await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.getByText(/Changes have not reached your account yet/)).toBeVisible();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeDisabled();expect(account.getHead().metadata.settings.name).toBe('Saved person');
 account.setFailure(false);await page.getByRole('button',{name:'Retry saving',exact:true}).click();await expect.poll(()=>account.getHead()?.metadata.settings.name).toBe('Pending person');await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByText('Unsaved preview.',{exact:true})).toBeVisible();await expect(page.getByLabel('Your name')).toHaveValue('');
});

test('mobile workout and dark settings fit the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});await accountFixture(page);await page.goto('/');await page.getByRole('button',{name:'Start session',exact:true}).click();await page.getByLabel('Set 1 reps',{exact:true}).fill('8');await page.getByRole('button',{name:'Log set 1',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await mkdir(evidence,{recursive:true});await page.screenshot({path:`${evidence}/workout-mobile.png`,fullPage:true});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${evidence}/settings-mobile.png`,fullPage:true});
});

test('an external auth change preserves an unsaved draft for the same account only',async({page})=>{
 const account=await accountFixture(page);await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();
 account.setFailure(true);await page.getByLabel('Your name').fill('Interrupted draft');await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.getByText(/Changes have not reached your account yet/)).toBeVisible();
 await account.broadcastAuth('SIGNED_OUT');await expect(page.getByText('Unsaved preview.',{exact:true})).toBeVisible();await expect(page.getByLabel('Your name')).toHaveValue('');await expect(page.getByText(/An account save was interrupted/)).toBeVisible();
 account.setFailure(false);await account.broadcastAuth('SIGNED_IN');await expect(page.getByLabel('Your name')).toHaveValue('Interrupted draft');await page.getByRole('button',{name:'Retry saving',exact:true}).click();await expect.poll(()=>account.getHead()?.metadata.settings.name).toBe('Interrupted draft');await expect(page.getByText(/An account save was interrupted/)).toHaveCount(0);
});
