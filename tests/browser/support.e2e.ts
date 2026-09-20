import { test, expect, type Page } from '@playwright/test';
import { accountFixture } from './account-fixture';
import { PUBLIC_CLOUD } from '../../src/data/cloud-config';

async function supportFixture(page:Page) {
  let voted=false, fail=false, loseResponse=false, writes=0;
  await page.route(`${PUBLIC_CLOUD.url}/rest/v1/**`, async route=>{
    const path=new URL(route.request().url()).pathname;
    if(!path.includes('pandr_support_'))return route.fallback();
    if(fail)return route.fulfill({status:503,json:{message:'Offline'}});
    if(path.endsWith('pandr_support_status'))return route.fulfill({json:[{total:7+Number(voted),voted}]});
    writes++;voted=route.request().method()==='POST';
    if(loseResponse){loseResponse=false;return route.abort('failed');}
    await route.fulfill({status:204});
  });
  return {writes:()=>writes,setFailure:(value:boolean)=>{fail=value},loseNextResponse:()=>{loseResponse=true}};
}
async function settings(page:Page){await page.getByRole('button',{name:'Settings',exact:true}).click();}

test('heart persists on reload, toggles once, recovers an uncertain write and stays private after sign-out',async({page})=>{
  await accountFixture(page);const f=await supportFixture(page);await page.goto('/');await settings(page);
  const panel=page.getByRole('region',{name:'Support PANDR-5'});
  const heart=panel.getByRole('button',{name:'Upvote PANDR-5',exact:true});
  await expect(panel.getByRole('status')).toHaveText('7 upvotes');
  await heart.dblclick();
  await expect(panel.getByRole('button',{name:'Remove your upvote for PANDR-5'})).toHaveAttribute('aria-pressed','true');
  expect(f.writes()).toBe(1);await expect(panel.getByRole('status')).toHaveText('8 upvotes');
  await page.reload();await settings(page);
  await expect(panel.getByRole('button',{name:'Remove your upvote for PANDR-5'})).toHaveAttribute('aria-pressed','true');
  f.loseNextResponse();await panel.getByRole('button',{name:'Remove your upvote for PANDR-5'}).click();
  await expect(panel.getByRole('alert')).toContainText('Couldn’t confirm');
  await expect(heart).toBeDisabled();await panel.getByRole('button',{name:'Retry upvotes'}).click();
  await expect(panel.getByRole('status')).toHaveText('7 upvotes');await expect(heart).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(heart).toBeDisabled();
  await expect(panel).toContainText('Sign in with Google in the Account section above');
});

test('mobile heart reports unavailable counts honestly and retries',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});
  await accountFixture(page);const f=await supportFixture(page);f.setFailure(true);await page.goto('/');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await settings(page);
  const panel=page.getByRole('region',{name:'Support PANDR-5'});
  await expect(panel.getByRole('status')).toHaveText('Count unavailable');await expect(panel.getByRole('button',{name:'Upvote PANDR-5',exact:true})).toBeDisabled();
  f.setFailure(false);await panel.getByRole('button',{name:'Retry upvotes'}).click();await expect(panel.getByRole('status')).toHaveText('7 upvotes');
  await panel.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await panel.screenshot({path:'test-results/support-mobile.png'});
});
