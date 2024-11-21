import test from 'ava'
import rewire from 'rewire'
import { getReleaseSource } from '../src/utils'
import axios from 'axios'

let utils = rewire('../src/utils')
let uri = `${utils.__get__('repoBaseUrl')}/maven-metadata.xml`

test('get maven xml', async t => {
  t.plan(1)
  const res = await axios.get(uri);
  t.is(res.status, 200)
})

test('regex release element from xml', async t => {
  t.plan(1)
  const res = await axios.get(uri);
  t.regex(res.data, new RegExp('<release>(.+)</release>'), 'success')
})

test('release version is string', async t => {
  t.plan(1)

  const res = await axios.get(uri);
  let releaseVersion = res.data.match(new RegExp('<release>(.+)</release>'))[1];
  t.is(typeof releaseVersion, 'string');
})

test('callback is object', async t => {
  t.plan(1)
  await getReleaseSource().then((response) => {
    t.is(typeof response, 'object')
  })
})
