import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './index.module.css';
// @ts-ignore
import Readme from '@reamplify/root/README.md';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="https://reflow.io">
            Reflow (AI-Augmented Browser Tests)
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://dev.reamplify.io">
            Demo Application (TodoMVC)
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout
      title="README"
      description="Re-implementation of the AWS Amplify CLI with pure CDK.">
      <HomepageHeader />
      <main>
        <Readme/>
      </main>
    </Layout>
  );
}
